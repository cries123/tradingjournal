import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getAdminConfig, isCurrentUserAdmin } from './admin';
import { markAccountDeleted } from './deletedAccounts';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

const BATCH_SIZE = 400;

async function deleteUserSubcollection(uid: string, name: 'trades' | 'settings' | 'dayNotes'): Promise<void> {
  const db = getFirebaseDb();

  while (true) {
    const snap = await getDocs(
      query(collection(db, 'users', uid, name), limit(BATCH_SIZE)),
    );
    if (snap.empty) break;

    const batch = writeBatch(db);
    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();

    if (snap.size < BATCH_SIZE) break;
  }
}

async function deleteUsernamesForUid(uid: string): Promise<void> {
  const db = getFirebaseDb();
  const snap = await getDocs(query(collection(db, 'usernames'), where('uid', '==', uid)));

  if (snap.empty) return;

  const batch = writeBatch(db);
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
  }
  await batch.commit();
}

/** Removes a user's Firestore data and blocks future app access (no Admin SDK required). */
export async function deleteUserViaFirestore(targetUid: string): Promise<{ message: string }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }

  const caller = getFirebaseAuth().currentUser;
  if (!caller) {
    throw new Error('Sign in required');
  }

  if (!(await isCurrentUserAdmin(caller.uid))) {
    throw new Error('Forbidden');
  }

  if (caller.uid === targetUid) {
    throw new Error('You cannot delete your own account from here');
  }

  const adminConfig = await getAdminConfig();
  if (adminConfig?.uid === targetUid) {
    throw new Error('The site admin account cannot be deleted');
  }

  await deleteUserSubcollection(targetUid, 'trades');
  await deleteUserSubcollection(targetUid, 'settings');
  await deleteUserSubcollection(targetUid, 'dayNotes');
  await deleteUsernamesForUid(targetUid);
  await markAccountDeleted(targetUid);
  await deleteDoc(doc(getFirebaseDb(), 'users', targetUid)).catch(() => undefined);

  return {
    message:
      'User removed — journal data deleted and sign-in blocked. Their Firebase login still exists but they cannot use the app.',
  };
}
