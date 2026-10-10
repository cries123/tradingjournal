import type { User } from 'firebase/auth';
import { lazyFirestore } from '../lib/lazyFirestore';
import { getVisitorId, markVisitorConverted } from './visitorAnalytics';

// Reached from the root auth context, so Firestore is loaded on demand — see lib/lazyFirestore.ts.

export async function ensureUserProfile(user: User, isNewUser = false): Promise<void> {
  const { fs, db } = await lazyFirestore();
  const ref = fs.doc(db, 'users', user.uid);
  const existing = await fs.getDoc(ref);
  const existingUsername = existing.exists()
    ? (existing.data() as { username?: string }).username?.trim()
    : undefined;

  const visitorId = isNewUser ? getVisitorId() : null;

  await fs.setDoc(
    ref,
    {
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
      ...(existingUsername ? { username: existingUsername } : {}),
      ...(isNewUser ? { createdAt: fs.serverTimestamp() } : {}),
      ...(isNewUser && visitorId ? { visitorId } : {}),
      lastLoginAt: fs.serverTimestamp(),
    },
    { merge: true },
  );

  if (isNewUser && visitorId) {
    await markVisitorConverted(visitorId, user.uid);
  }
}
