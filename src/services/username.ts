import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '../lib/firebase';
import { normalizeUsername, validateUsername } from '../utils/usernameValidation';

export class UsernameTakenError extends Error {
  constructor() {
    super('That username is already taken.');
    this.name = 'UsernameTakenError';
  }
}

export async function isUsernameAvailable(username: string, currentUid?: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  const validation = validateUsername(normalized);
  if (!validation.ok) return false;

  const ref = doc(getFirebaseDb(), 'usernames', normalized);
  const snap = await getDoc(ref);
  if (!snap.exists()) return true;
  const data = snap.data() as { uid?: string };
  return Boolean(currentUid && data.uid === currentUid);
}

export async function claimUsername(uid: string, rawUsername: string): Promise<string> {
  const validation = validateUsername(rawUsername);
  if (!validation.ok) throw new Error(validation.error);

  const normalized = validation.normalized;
  const usernameRef = doc(getFirebaseDb(), 'usernames', normalized);
  const userRef = doc(getFirebaseDb(), 'users', uid);

  await runTransaction(getFirebaseDb(), async (tx) => {
    const existing = await tx.get(usernameRef);
    if (existing.exists()) {
      const owner = existing.data()?.uid as string | undefined;
      if (owner !== uid) throw new UsernameTakenError();
    } else {
      tx.set(usernameRef, {
        uid,
        username: normalized,
        createdAt: serverTimestamp(),
      });
    }
    tx.set(userRef, { username: normalized }, { merge: true });
  });

  return normalized;
}

export async function fetchUsername(uid: string): Promise<string | null> {
  const userRef = doc(getFirebaseDb(), 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  const data = snap.data() as { username?: string };
  return data.username?.trim() || null;
}
