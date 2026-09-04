import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { getAdminAuth } from './firebaseAdmin';
import { readEntitlement, writeEntitlement } from './entitlements';
import { decideTrial, refuse, TRIAL_DAYS, type TrialDecision } from '../src/config/trial';
import { TIER_PLANS } from '../src/config/tiers';
import type { ComplimentaryAccess } from '../src/config/accessExtension';
import {
  findTrialClaim,
  flagsForClaim,
  mailboxKey,
  recordTrialClaim,
  type ClaimSignals,
} from './trialGuards';

/**
 * Starting the free trial.
 *
 * The entitlement rule (decideTrial) stops one ACCOUNT taking two. The checks here stop one
 * PERSON taking one per account: the address has to be confirmed, and it has to be a mailbox that
 * has never had a trial under any login — with plus-addressing and Gmail dots collapsed, since
 * "jay+1@, jay+2@" is the whole technique.
 *
 * None of it is a wall. It is sized against what abuse costs, which is about a dollar of
 * SnapTrade fees per trial that actually connects a broker, and against the far worse outcome of
 * refusing a real customer.
 */
export interface TrialResult {
  statusCode: number;
  body: Record<string, unknown>;
}

/** The caller's own network address, as the platform reports it. */
function callerIp(headers: IncomingHttpHeaders): string | null {
  const forwarded = headers['x-nf-client-connection-ip'] ?? headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return typeof raw === 'string' && raw.trim() ? raw.split(',')[0].trim() : null;
}

/**
 * Everything about the account that decides eligibility, in the order it should be asked.
 *
 * Split out so the entitlement endpoint can ask the same question to decide whether to draw the
 * button, and get the same answer this endpoint would give.
 */
export async function trialEligibility(
  uid: string,
  now: number,
): Promise<{ decision: TrialDecision; mailbox: string | null }> {
  const account = await getAdminAuth().getUser(uid);

  const record = await readEntitlement(uid);
  const fromRecord = decideTrial(record, now);
  // Asked first, so somebody who has already used their trial is told that rather than being sent
  // off to confirm an address that will not help them.
  if (!fromRecord.eligible) return { decision: fromRecord, mailbox: null };

  // Google sign-ins arrive verified. An email/password signup does not, and an address nobody has
  // proved they can read is not an identity — it is a string somebody typed.
  if (!account.emailVerified) return { decision: refuse('email-unverified'), mailbox: null };

  const mailbox = mailboxKey(account.email);
  if (!mailbox) return { decision: refuse('email-unverified'), mailbox: null };

  const claim = await findTrialClaim(mailbox);
  if (claim && claim.uid !== uid) return { decision: refuse('email-already-used'), mailbox };

  return { decision: fromRecord, mailbox };
}

export async function handleStartTrial(headers: IncomingHttpHeaders): Promise<TrialResult> {
  let uid: string;
  try {
    uid = await assertCallerUid(headers);
  } catch (err) {
    const status = err instanceof BrokerRequestError ? err.statusCode : 401;
    return {
      statusCode: status,
      body: { error: err instanceof Error ? err.message : 'Sign in required' },
    };
  }

  try {
    const now = Date.now();
    const { decision, mailbox } = await trialEligibility(uid, now);

    if (!decision.eligible) {
      // 409, not 403: nothing is wrong with the request or the caller, the account is simply not
      // in a state where a trial means anything.
      return { statusCode: 409, body: { error: decision.message, reason: decision.reason } };
    }

    const startedAt = new Date(now).toISOString();
    const comp: ComplimentaryAccess = {
      tier: decision.tier,
      until: decision.until,
      grantedBy: 'trial',
      grantedAt: startedAt,
      reason: `${TRIAL_DAYS}-day free trial`,
      trial: true,
    };

    // trialStartedAt is written in the same call as the comp. Written separately, a failure
    // between the two would either hand out a trial that never counted against them, or count one
    // they never got.
    const existing = await readEntitlement(uid);
    await writeEntitlement(
      uid,
      existing
        ? { comp, trialStartedAt: startedAt }
        : { tier: 'free', source: 'purchase', status: 'active', comp, trialStartedAt: startedAt },
    );

    /*
     * The claim is recorded after the grant, and its failure is swallowed.
     *
     * The order matters in one direction only: a claim written before a grant that then fails
     * would burn somebody's one trial without giving it to them. This way the worst case is a
     * trial that our records forget to count, which costs a dollar.
     */
    if (mailbox) {
      const signals: ClaimSignals = {
        visitorId: typeof headers['x-visitor-id'] === 'string' ? headers['x-visitor-id'] : null,
        ip: callerIp(headers),
      };
      try {
        await recordTrialClaim(mailbox, uid, signals, await flagsForClaim(uid, signals));
      } catch (err) {
        console.error('[start-trial] could not record the claim:', err);
      }
    }

    return {
      statusCode: 200,
      body: {
        ok: true,
        tier: decision.tier,
        until: decision.until,
        message: `${TIER_PLANS[decision.tier].name} is yours for the next ${TRIAL_DAYS} days.`,
      },
    };
  } catch (err) {
    console.error('[start-trial] failed:', err);
    return { statusCode: 500, body: { error: 'Could not start your trial. Try again shortly.' } };
  }
}
