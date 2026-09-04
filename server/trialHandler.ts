import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { readEntitlement, writeEntitlement } from './entitlements';
import { decideTrial, TRIAL_DAYS } from '../src/config/trial';
import { TIER_PLANS } from '../src/config/tiers';
import type { ComplimentaryAccess } from '../src/config/accessExtension';

/**
 * Starting the free trial.
 *
 * The decision is decideTrial, the same function the pricing page uses to decide whether to show
 * the button — so the client can be wrong about eligibility, or lie about it, and get the same
 * answer either way. This endpoint is the one that counts.
 *
 * The trial is written as a complimentary grant, which the rest of the system already knows what
 * to do with: effectiveTier honours it, the plan badge counts it down, the reaper spares the
 * broker link while it runs and takes it back after. Nothing has to be scheduled to end it.
 */
export interface TrialResult {
  statusCode: number;
  body: Record<string, unknown>;
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
    const existing = await readEntitlement(uid);
    const now = Date.now();
    const decision = decideTrial(existing, now);

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
    await writeEntitlement(
      uid,
      existing
        ? { comp, trialStartedAt: startedAt }
        : { tier: 'free', source: 'purchase', status: 'active', comp, trialStartedAt: startedAt },
    );

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
