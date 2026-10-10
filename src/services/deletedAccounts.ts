import { isFirebaseConfigured } from '../lib/firebaseAuth';
import { lazyFirestore } from '../lib/lazyFirestore';

// Reached from the root auth context, so Firestore is loaded on demand — see lib/lazyFirestore.ts.

export async function isAccountDeleted(uid: string): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  const { fs, db } = await lazyFirestore();
  const snap = await fs.getDoc(fs.doc(db, 'deletedAccounts', uid));
  return snap.exists();
}

export async function markAccountDeleted(uid: string): Promise<void> {
  const { fs, db } = await lazyFirestore();
  await fs.setDoc(fs.doc(db, 'deletedAccounts', uid), {
    deletedAt: fs.serverTimestamp(),
  });
}
