import { createHash } from 'crypto';
import { getAdminFirestore } from './firebaseAdmin';
import { normalizeEmail } from '../src/config/emailIdentity';

/**
 * Everything that decides whether a free trial is a first one.
 *
 * The entitlement record already stops the same ACCOUNT taking two. This is the other half: the
 * same person taking one per account. It is a deterrent, not a wall — anyone determined enough
 * can beat all of it — so every rule is sized against what abuse actually costs here, which is
 * about a dollar of SnapTrade fees per trial that connects a broker.
 *
 * Nothing identifying is stored. Addresses, IPs and account numbers are hashed on the way in, and
 * the hash is only ever compared against another hash — so these records answer "has this been
 * seen before" and nothing else.
 */

/** Salted so the stored hashes can't be checked against a list of guessed addresses. */
function salt(): string {
  return process.env.IDENTITY_HASH_SALT || 'trend-chasers';
}

export function identityHash(value: string): string {
  return createHash('sha256').update(`${salt()}:${value}`).digest('hex').slice(0, 32);
}

/** The mailbox key for a trial claim, or null when the address is unusable. */
export function mailboxKey(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  return normalized ? identityHash(normalized) : null;
}

/**
 * A brokerage account, identified in a way that survives a new signup.
 *
 * SnapTrade issues its own ids per user, so those are useless across accounts — link the same
 * Schwab account under a second signup and every id differs. The masked account number does not
 * change, and paired with the institution it is the one thing that identifies the real account
 * behind two Trend Chasers logins. Hashed, so what is stored cannot be read back.
 */
export function brokerageKey(institution: string | null, accountNumber: string | null): string | null {
  const inst = (institution ?? '').trim().toLowerCase();
  const number = (accountNumber ?? '').trim();
  // A number too short to be masked digits is not identifying, and hashing it would create
  // collisions between unrelated accounts at the same brokerage.
  if (!inst || number.length < 4) return null;
  return identityHash(`${inst}|${number}`);
}

/* ------------------------------------------------------------------ claims */

export interface TrialClaim {
  uid: string;
  claimedAt: string;
}

function claimDoc(mailbox: string) {
  return getAdminFirestore().doc(`trialClaims/${mailbox}`);
}

/** Who, if anyone, has already had a trial on this mailbox. */
export async function findTrialClaim(mailbox: string): Promise<TrialClaim | null> {
  const snap = await claimDoc(mailbox).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<TrialClaim>;
  return {
    uid: typeof data.uid === 'string' ? data.uid : '',
    claimedAt: typeof data.claimedAt === 'string' ? data.claimedAt : '',
  };
}

/**
 * Records the claim. Written after Creem says the trial started, so a write failure cannot deny one.
 *
 * The mailbox and nothing else. It used to store a hash of the browser id and the caller IP too, and
 * a set of advisory flags derived from them — "same browser as an earlier trial", "several trials
 * from one network" — read from the request that granted the trial. That request is now Creem's
 * webhook: there is no browser, and the IP is Creem's, so every trial would have been flagged as
 * coming from one network. Capturing those signals again would mean recording them at checkout,
 * where the person actually is, and passing them through the subscription metadata.
 */
export async function recordTrialClaim(mailbox: string, uid: string): Promise<void> {
  // create-only, like claimBrokerage below and for the same reason: the FIRST account to claim a
  // mailbox keeps it. With set+merge, a second signup on the same address would quietly take the
  // record over and reset its date — rewriting the one row an admin opens to investigate farming,
  // using the farming itself.
  await claimDoc(mailbox)
    .create({ uid, claimedAt: new Date().toISOString() })
    .catch(() => undefined);
}

/* ------------------------------------------------------------------ brokerages */

function brokerageDoc(key: string) {
  return getAdminFirestore().doc(`brokerageClaims/${key}`);
}

/**
 * The account that first linked this brokerage, if it wasn't this one.
 *
 * Recorded for everybody but only ever ENFORCED against a trial: a paying customer who opens a
 * second account, or comes back after deleting one, must never be told their own brokerage is
 * spoken for.
 */
export async function brokerageOwner(key: string): Promise<string | null> {
  const snap = await brokerageDoc(key).get();
  const uid = (snap.data() as { uid?: string } | undefined)?.uid;
  return typeof uid === 'string' && uid ? uid : null;
}

export async function claimBrokerage(key: string, uid: string): Promise<void> {
  // create-only: the first account to link a brokerage keeps it, so somebody cannot take it over
  // by connecting from a second signup.
  await brokerageDoc(key)
    .create({ uid, firstSeenAt: new Date().toISOString() })
    .catch(() => undefined);
}
