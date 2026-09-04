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
  /** Signals worth a look, never a reason to refuse on their own. */
  flags: string[];
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
    flags: Array.isArray(data.flags) ? data.flags.filter((f): f is string => typeof f === 'string') : [],
  };
}

export interface ClaimSignals {
  /** The browser's own long-lived id, as the visitor analytics already know it. */
  visitorId?: string | null;
  ip?: string | null;
}

/**
 * Signals that this claim resembles one already made.
 *
 * Deliberately advisory. A shared browser is a library computer or a couple at a kitchen table,
 * and a shared IP is an office, a phone network or a household — blocking on either refuses more
 * real customers than it stops abusers. Recorded so a human can look, and so a pattern across
 * twenty accounts is visible as a pattern rather than as twenty unremarkable signups.
 */
export async function flagsForClaim(uid: string, signals: ClaimSignals): Promise<string[]> {
  const db = getAdminFirestore();
  const flags: string[] = [];

  const browser = signals.visitorId ? identityHash(signals.visitorId) : null;
  const network = signals.ip ? identityHash(signals.ip) : null;

  const [sameBrowser, sameNetwork] = await Promise.all([
    browser
      ? db.collection('trialClaims').where('browser', '==', browser).limit(2).get()
      : null,
    network ? db.collection('trialClaims').where('network', '==', network).limit(4).get() : null,
  ]);

  if (sameBrowser?.docs.some((d) => (d.data() as { uid?: string }).uid !== uid)) {
    flags.push('same-browser-as-an-earlier-trial');
  }
  const otherOnNetwork = sameNetwork?.docs.filter((d) => (d.data() as { uid?: string }).uid !== uid) ?? [];
  if (otherOnNetwork.length >= 3) flags.push('several-trials-from-one-network');

  return flags;
}

/** Records the claim. Written after the trial is granted, so a write failure cannot deny one. */
export async function recordTrialClaim(
  mailbox: string,
  uid: string,
  signals: ClaimSignals,
  flags: string[],
): Promise<void> {
  await claimDoc(mailbox).set(
    {
      uid,
      claimedAt: new Date().toISOString(),
      flags,
      ...(signals.visitorId ? { browser: identityHash(signals.visitorId) } : {}),
      ...(signals.ip ? { network: identityHash(signals.ip) } : {}),
    },
    { merge: true },
  );
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
