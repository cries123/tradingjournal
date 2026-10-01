import { getAdminAuth } from './firebaseAdmin';
import { readEntitlement } from './entitlements';
import { decideTrial, refuse, type TrialDecision } from '../src/config/trial';
import { findTrialClaim, mailboxKey, recordTrialClaim } from './trialGuards';

/**
 * Whether this account may start the free trial, and the record that it has.
 *
 * The trial itself belongs to Creem — it is attached to the Silver product, so it is redeemed by
 * going through checkout and the card is taken up front. There is nothing here that grants one.
 *
 * There used to be. `POST /api/start-trial` granted seven days of complimentary Silver, no card,
 * to any signed-in account that asked; when the trial moved to Creem only the BUTTON was changed,
 * so the endpoint stayed routed and reachable for anyone who knew the path. It also merged a comp
 * onto a record the webhook writes to, so an account could hold a free week and a paid
 * subscription at once — counted as a trial by the emails and as revenue by the costs screen.
 * That endpoint and its handler are gone; what is left is the question the pricing page asks.
 */

/**
 * Everything about the account that decides eligibility, in the order it should be asked.
 *
 * Read on every authenticated entitlement load, which is the hottest signed-in endpoint there is,
 * so the order is also a cost: the cheap local rule is asked before the Auth lookup, and the
 * mailbox lookup only happens for someone who could otherwise have one.
 */
export async function trialEligibility(
  uid: string,
  now: number,
): Promise<{ decision: TrialDecision; mailbox: string | null }> {
  const record = await readEntitlement(uid);
  const fromRecord = decideTrial(record, now);
  // Asked first, so somebody who has already used their trial is told that rather than being sent
  // off to confirm an address that will not help them — and so the common case, a subscriber,
  // costs one Firestore read and nothing else.
  if (!fromRecord.eligible) return { decision: fromRecord, mailbox: null };

  const account = await getAdminAuth().getUser(uid);

  // Google sign-ins arrive verified. An email/password signup does not, and an address nobody has
  // proved they can read is not an identity — it is a string somebody typed.
  if (!account.emailVerified) return { decision: refuse('email-unverified'), mailbox: null };

  const mailbox = mailboxKey(account.email);
  if (!mailbox) return { decision: refuse('email-unverified'), mailbox };

  /*
   * One trial per mailbox, with plus-addressing and Gmail dots collapsed.
   *
   * The entitlement rule above stops one ACCOUNT taking two. This is the other half: one PERSON
   * taking one per account, which "jay+1@, jay+2@" makes free. It only became real when the Creem
   * webhook started recording a claim — before that nothing ever wrote to trialClaims, so this
   * query could only ever miss and the whole defence protected nothing.
   */
  const claim = await findTrialClaim(mailbox);
  if (claim && claim.uid !== uid) return { decision: refuse('email-already-used'), mailbox };

  return { decision: fromRecord, mailbox };
}

/**
 * Remembers that this mailbox has had a trial. Called when Creem says one has started.
 *
 * No browser or network signals, deliberately. The caller is Creem's server, so the IP on the
 * request is Creem's — recording it would mark every trial as coming from the same network and
 * flag the lot. The signals are only ever advisory anyway; what matters is the mailbox.
 */
export async function rememberTrial(uid: string): Promise<void> {
  const account = await getAdminAuth().getUser(uid);
  const mailbox = mailboxKey(account.email);
  if (!mailbox) return;

  await recordTrialClaim(mailbox, uid);
}
