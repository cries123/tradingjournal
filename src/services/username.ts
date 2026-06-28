import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
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

  cacheUsername(uid, normalized);
  return normalized;
}

export async function fetchUsername(uid: string): Promise<string | null> {
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const fromProfile = (snap.data() as { username?: string }).username?.trim();
    if (fromProfile) return fromProfile;
  }

  // Fallback: username may exist in usernames/{name} but not yet on users/{uid}
  const usernameQuery = query(collection(db, 'usernames'), where('uid', '==', uid), limit(1));
  const usernameSnap = await getDocs(usernameQuery);
  if (!usernameSnap.empty) {
    const match = usernameSnap.docs[0]!;
    const fromRegistry =
      (match.data() as { username?: string }).username?.trim() || match.id.trim();
    if (fromRegistry) {
      await setDoc(userRef, { username: fromRegistry }, { merge: true });
      return fromRegistry;
    }
  }

  return null;
}

const USERNAME_CACHE_PREFIX = 'trend-chasers-username:';

export function readCachedUsername(uid: string): string | null {
  try {
    return localStorage.getItem(`${USERNAME_CACHE_PREFIX}${uid}`)?.trim() || null;
  } catch {
    return null;
  }
}

export function cacheUsername(uid: string, username: string): void {
  try {
    localStorage.setItem(`${USERNAME_CACHE_PREFIX}${uid}`, username);
  } catch {
    // ignore quota / private mode
  }
}

export function clearCachedUsername(uid: string): void {
  try {
    localStorage.removeItem(`${USERNAME_CACHE_PREFIX}${uid}`);
  } catch {
    // ignore
  }
}
