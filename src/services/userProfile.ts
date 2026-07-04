import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getFirebaseDb } from '../lib/firebase';
import { getVisitorId, markVisitorConverted } from './visitorAnalytics';

export async function ensureUserProfile(user: User, isNewUser = false): Promise<void> {
  const ref = doc(getFirebaseDb(), 'users', user.uid);
  const existing = await getDoc(ref);
  const existingUsername = existing.exists()
    ? (existing.data() as { username?: string }).username?.trim()
    : undefined;

  const visitorId = isNewUser ? getVisitorId() : null;

  await setDoc(
    ref,
    {
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
      ...(existingUsername ? { username: existingUsername } : {}),
      ...(isNewUser ? { createdAt: serverTimestamp() } : {}),
      ...(isNewUser && visitorId ? { visitorId } : {}),
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (isNewUser && visitorId) {
    await markVisitorConverted(visitorId, user.uid);
  }
}
