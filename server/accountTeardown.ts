import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { resetBrokerLink } from './adminAccountActions';

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

  await db.doc(`users/${uid}`).delete().catch(() => undefined);

  // SnapTrade keeps charging for a connection until the user under it is deleted, and nothing else
  // would ever delete one for an account that no longer exists. Best effort: a refusal here must
  // not leave the account half-deleted.
  await resetBrokerLink(uid).catch((err) => {
    console.warn(`[account-teardown] could not clear the SnapTrade user for ${uid}:`, err);
  });
  await db.doc(`brokerConnections/${uid}`).delete().catch(() => undefined);
  await db.doc(`usageCredits/${uid}`).delete().catch(() => undefined);

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
