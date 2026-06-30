import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export async function isAccountDeleted(uid: string): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  const snap = await getDoc(doc(getFirebaseDb(), 'deletedAccounts', uid));
  return snap.exists();
}

export async function markAccountDeleted(uid: string): Promise<void> {
  await setDoc(doc(getFirebaseDb(), 'deletedAccounts', uid), {
    deletedAt: serverTimestamp(),
  });
}
