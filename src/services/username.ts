// Reached from the root auth context, so Firestore is loaded on demand — see lib/lazyFirestore.ts.
import { lazyFirestore } from '../lib/lazyFirestore';
import { normalizeUsername, validateUsername } from '../utils/usernameValidation';

export class UsernameTakenError extends Error {
  constructor() {
    super('That username is already taken.');
    this.name = 'UsernameTakenError';
  }
}

/**
 * Whether a handle can be claimed, asked of the server.
 *
 * Was a direct getDoc on usernames/{handle}. That document carries the owning uid, so the rules
 * require auth to read it — and the form that needs this most is sign-up, where nobody is signed
 * in. The read was refused 100% of the time it ran there: the hint never appeared once, and each
 * attempt threw an unhandled FirebaseError into the error feed.
 *
 * One path for both forms rather than branching on whether somebody is signed in, because two
 * paths means the signed-out one is the one nobody tests — which is exactly how this happened.
 */
export async function isUsernameAvailable(username: string, currentUid?: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  const validation = validateUsername(normalized);
  if (!validation.ok) return false;

  const res = await fetch('/api/username-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'available', username: normalized }),
  });

  const data = (await res.json().catch(() => ({}))) as { available?: boolean };
  if (data.available) return true;

  /*
   * Taken — but possibly by the person asking.
   *
   * The endpoint deliberately will not say whose it is, so the rename form checks ownership
   * here, where the uid is already known and the read is one the rules allow for a signed-in
   * user. Somebody renaming themselves to the handle they already hold should not be told it
   * is unavailable.
   */
  if (!currentUid) return false;

  try {
    const { fs, db } = await lazyFirestore();
    const snap = await fs.getDoc(fs.doc(db, 'usernames', normalized));
    return (snap.data() as { uid?: string } | undefined)?.uid === currentUid;
  } catch {
    // Signed in but refused: treat it as taken rather than claiming a handle that is not theirs.
    return false;
  }
}

export async function claimUsername(uid: string, rawUsername: string): Promise<string> {
  const validation = validateUsername(rawUsername);
  if (!validation.ok) throw new Error(validation.error);

  const normalized = validation.normalized;
  const { fs, db } = await lazyFirestore();
  const usernameRef = fs.doc(db, 'usernames', normalized);
  const userRef = fs.doc(db, 'users', uid);

  await fs.runTransaction(db, async (tx) => {
    const existing = await tx.get(usernameRef);
    if (existing.exists()) {
      const owner = existing.data()?.uid as string | undefined;
      if (owner !== uid) throw new UsernameTakenError();
    } else {
      tx.set(usernameRef, {
        uid,
        username: normalized,
        createdAt: fs.serverTimestamp(),
      });
    }
    tx.set(userRef, { username: normalized }, { merge: true });
  });

  cacheUsername(uid, normalized);
  return normalized;
}

export async function fetchUsername(uid: string): Promise<string | null> {
  const { fs, db } = await lazyFirestore();
  const userRef = fs.doc(db, 'users', uid);
  const snap = await fs.getDoc(userRef);

  if (snap.exists()) {
    const fromProfile = (snap.data() as { username?: string }).username?.trim();
    if (fromProfile) return fromProfile;
  }

  // Fallback: username may exist in usernames/{name} but not yet on users/{uid}
  const usernameQuery = fs.query(fs.collection(db, 'usernames'), fs.where('uid', '==', uid), fs.limit(1));
  const usernameSnap = await fs.getDocs(usernameQuery);
  if (!usernameSnap.empty) {
    const match = usernameSnap.docs[0]!;
    const fromRegistry =
      (match.data() as { username?: string }).username?.trim() || match.id.trim();
    if (fromRegistry) {
      await fs.setDoc(userRef, { username: fromRegistry }, { merge: true });
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
