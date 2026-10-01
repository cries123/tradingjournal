import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { resetBrokerLink } from './adminAccountActions';
import { cancelSubscription } from './creemClient';
import { readEntitlement } from './entitlements';

/**
 * Everything an account leaves behind, removed.
 *
 * One implementation with two callers — the admin panel deleting somebody, and somebody deleting
 * themselves from Account settings. Two copies of a deletion routine is the worst possible thing
 * to have two copies of: the day they drift, one of them is quietly leaving data behind on a path
 * that told the user it was gone.
 *
 * Ordered so the expensive, external thing happens while the account still exists, and the Auth
 * record goes last. Every step that can fail without leaving the account in a worse state is best
 * effort, because a half-deleted account is harder to reason about than a fully deleted one with
 * one orphaned document.
 */
export async function purgeAccount(uid: string): Promise<void> {
  const db = getAdminFirestore();

  /*
   * The subscription first, and allowed to stop everything else.
   *
   * Deleting a Firebase Auth user tells Creem nothing. So this routine removed the journal, the
   * notes, the brokerage link and the sign-in, and left the subscription renewing every month
   * against somebody who no longer had an account to sign in with — no portal, no checkout, no way
   * to stop it, and the delete dialog had told them "Any subscription stops billing." The comment
   * in accountHandler justifying no subscription check said the same thing and was equally wrong.
   *
   * Deliberately NOT best-effort, unlike the broker link below. If the cancel fails the money is
   * still moving, and the right outcome is a deletion that refuses and says so — they can cancel in
   * Manage billing and try again — rather than one that succeeds into a charge they cannot reach.
   */
  const entitlement = await readEntitlement(uid).catch(() => null);
  if (entitlement?.creemSubscriptionId) {
    await cancelSubscription(entitlement.creemSubscriptionId);
  }

  await deleteCollectionDocs(`users/${uid}/trades`);
  await deleteCollectionDocs(`users/${uid}/settings`);
  await deleteCollectionDocs(`users/${uid}/dayNotes`);
  /*
   * These two were not in the original teardown and are now, because "delete my account" is a
   * promise about data rather than about sign-in. `takeaways` is cached AI commentary written from
   * the person's own trades, and `private` holds their SnapTrade userSecret — the one thing in the
   * account nobody should ever be able to leave behind.
   */
  await deleteCollectionDocs(`users/${uid}/takeaways`);
  await deleteCollectionDocs(`users/${uid}/private`);

  // The clear/sync history shown in the admin panel. Written by the Admin SDK only, which is why it
  // appears in no rule — and why nothing else would ever have removed it.
  await deleteCollectionDocs(`journalEvents/${uid}/events`);

  /*
   * Every username they have ever held, including the ones retired by a rename. Those docs exist
   * to stop somebody else inheriting a handle the account traded under — a reason that ends when
   * the account does.
   */
  const usernames = await db.collection('usernames').where('uid', '==', uid).get();
  if (!usernames.empty) {
    const batch = db.batch();
    usernames.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  /*
   * Any published track record, which is the only thing this account leaves on the public internet.
   *
   * It was not torn down at all. Deleting your account removed the journal and left a public page
   * carrying your handle, your win rate, your P&L and a "verified by Trend Chasers" badge — online
   * for good, with the button that would have taken it down behind an account that no longer
   * exists. "Delete my account" is a promise about data, and this was the most visible data there
   * was.
   *
   * It also blocked the next person. The username is released just above, so somebody else can
   * claim the handle — and publishing would then be refused, because the ownership row at that slug
   * still named a uid that is gone.
   *
   * Found by ownership rather than by username, so a record published under a handle retired by an
   * earlier rename goes too.
   */
  const records = await db.collection('trackRecordOwners').where('uid', '==', uid).get();
  if (!records.empty) {
    const batch = db.batch();
    records.docs.forEach((doc) => {
      batch.delete(db.doc(`trackRecords/${doc.id}`));
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  await db.doc(`users/${uid}`).delete().catch(() => undefined);

  // SnapTrade keeps charging for a connection until the user under it is deleted, and nothing else
  // would ever delete one for an account that no longer exists. Best effort: a refusal here must
  // not leave the account half-deleted.
  await resetBrokerLink(uid).catch((err) => {
    console.warn(`[account-teardown] could not clear the SnapTrade user for ${uid}:`, err);
  });
  await db.doc(`brokerConnections/${uid}`).delete().catch(() => undefined);
  await db.doc(`usageCredits/${uid}`).delete().catch(() => undefined);
  /*
   * The entitlement row, which nothing else ever removed.
   *
   * It outlived every deleted account, and readSubscriptionRunRate counts any row with status
   * 'active', source 'purchase' and a subscription id — so every deleted customer went on being
   * counted in the admin MRR and subscriber totals for good. Safe to drop now that the subscription
   * above is actually cancelled: the record described a subscription that no longer exists.
   */
  await db.doc(`entitlements/${uid}`).delete().catch(() => undefined);

  try {
    await getAdminAuth().deleteUser(uid);
  } catch (err) {
    // Already gone is the outcome we wanted, not a failure.
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }
}

async function deleteCollectionDocs(collectionPath: string): Promise<number> {
  const db = getAdminFirestore();
  let deleted = 0;

  // Paged rather than fetched whole: a journal with thousands of trades exceeds both the batch
  // limit and what is sensible to hold in a function's memory at once.
  for (;;) {
    const snap = await db.collection(collectionPath).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
  }

  return deleted;
}
