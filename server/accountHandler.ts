import { getAdminFirestore } from './firebaseAdmin';
import { decideRename, renameAvailableAt } from './usernameRename';
import { validateUsername } from '../src/utils/usernameValidation';
import { isTier, TIER_PLANS, type Tier } from '../src/config/tiers';

/**
 * The two account operations a client is not allowed to perform for itself.
 *
 * Both run through the Admin SDK, which bypasses security rules — and that is the point rather
 * than a side effect. `usernames/{name}` is `allow update: if false` and `billingCharges` is
 * `read, write: if false`, and both should stay that way: a client that could rewrite the username
 * index could take a name off somebody, and a client that could read the charge ledger could read
 * everyone's. Doing this work here means the rules do not have to be loosened to ship the feature,
 * so nothing has to be re-pasted into the Firebase console for either of these.
 *
 * Changing an email or a password is deliberately NOT here. Those are Firebase Auth operations the
 * client SDK performs directly after re-authenticating the user, which is stronger than anything
 * this endpoint could do: a stolen ID token is enough to call this function, but not enough to
 * reauthenticate, and Firebase requires the password again before either change.
 */

export class AccountRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AccountRequestError';
    this.statusCode = statusCode;
  }
}

export interface RenameResult {
  username: string;
  /** When they may change it again — the UI shows this rather than making them discover it. */
  nextChangeAt: string | null;
}

export async function renameUsernameFor(uid: string, requested: string): Promise<RenameResult> {
  const validation = validateUsername(requested);
  if (!validation.ok) throw new AccountRequestError(validation.error, 400);
  const normalized = validation.normalized;

  const db = getAdminFirestore();
  const userRef = db.doc(`users/${uid}`);
  const nextRef = db.doc(`usernames/${normalized}`);

  const [userSnap, nextSnap] = await Promise.all([userRef.get(), nextRef.get()]);
  const profile = userSnap.data() as
    | { username?: string; lastUsernameChangeAt?: string }
    | undefined;

  const decision = decideRename(
    {
      uid,
      current: profile?.username?.trim() || null,
      lastChangedAt: profile?.lastUsernameChangeAt ?? null,
      requested: normalized,
      ownerOfRequested: (nextSnap.data() as { uid?: string } | undefined)?.uid ?? null,
    },
    Date.now(),
  );

  if (!decision.ok) {
    // 409 for "somebody else has it" and "not yet", 400 for a name that could never be valid.
    throw new AccountRequestError(decision.message, decision.reason === 'invalid' ? 400 : 409);
  }

  const changedAt = new Date().toISOString();

  /*
   * The old usernames/{name} doc is deliberately left in place, still pointing at this uid.
   *
   * That is what makes a rename safe here: the handle somebody traded under stays theirs, so a
   * share card or a link that carries it can never come to mean a different person. The index
   * gains one row per rename and nothing ever has to clean it up.
   */
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(nextRef);
    const owner = (fresh.data() as { uid?: string } | undefined)?.uid;
    // Re-checked inside the transaction: the read above and this write are not atomic, and two
    // people claiming the same free name in the same second is exactly when that matters.
    if (fresh.exists && owner !== uid) {
      throw new AccountRequestError('That username is already taken.', 409);
    }

    if (!fresh.exists) {
      tx.set(nextRef, { uid, username: normalized, createdAt: changedAt });
    }

    tx.set(userRef, { username: normalized, lastUsernameChangeAt: changedAt }, { merge: true });
  });

  return { username: normalized, nextChangeAt: renameAvailableAt(changedAt) };
}

export interface OrderHistoryEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Whole dollars. */
  amount: number;
  tier: Tier;
  planName: string;
  /** The Creem event this came from, or 'backfill' for one entered by hand. */
  eventType: string;
}

export interface OrderHistory {
  entries: OrderHistoryEntry[];
  /** Everything they have ever paid, in whole dollars. */
  total: number;
}

export async function readOrderHistory(uid: string): Promise<OrderHistory> {
  /*
   * Filtered in the query, sorted in memory.
   *
   * `.where('uid','==',x).orderBy('at','desc')` is a composite index, which would mean somebody
   * creating one in the Firebase console before this screen worked at all — and it would fail in
   * production rather than here, as an empty list with an error only in the function log. A uid
   * equality filter alone runs on the automatic single-field index. Nobody has enough charge rows
   * for the sort to be worth an index: this is one row per payment, so a year of Diamond is twelve.
   */
  const snap = await getAdminFirestore().collection('billingCharges').where('uid', '==', uid).get();

  const entries: OrderHistoryEntry[] = snap.docs
    .map((doc) => {
      const data = doc.data() as {
        at?: string;
        amount?: number;
        tier?: string;
        eventType?: string;
      };
      const tier: Tier = isTier(data.tier) ? data.tier : 'free';

      return {
        id: doc.id,
        at: typeof data.at === 'string' ? data.at : '',
        amount: typeof data.amount === 'number' && Number.isFinite(data.amount) ? data.amount : 0,
        tier,
        planName: TIER_PLANS[tier].name,
        eventType: typeof data.eventType === 'string' ? data.eventType : 'payment',
      };
    })
    // A row with no timestamp sorts last rather than throwing the order out. It cannot be placed
    // correctly, and dropping it would be hiding money the person actually paid.
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);

  return { entries, total };
}
