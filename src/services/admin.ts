import { collection, doc, getCountFromServer, getDoc, getDocs, runTransaction } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface AdminConfig {
  uid: string;
  email: string;
  username?: string;
  claimedAt: string;
}

export type AdminAccessResult =
  | { ok: true; isNewClaim: boolean }
  | { ok: false; reason: 'not-configured' | 'denied' | 'not-signed-in' };

export async function getAdminConfig(): Promise<AdminConfig | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(doc(getFirebaseDb(), 'config', 'admin'));
  if (!snap.exists()) return null;
  return snap.data() as AdminConfig;
}

export async function isCurrentUserAdmin(uid: string): Promise<boolean> {
  const config = await getAdminConfig();
  return config?.uid === uid;
}

/** First signed-in user to visit admin claims the role; all others are denied. */
export async function claimOrVerifyAdmin(
  uid: string,
  email: string,
  username?: string | null,
): Promise<AdminAccessResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, reason: 'not-configured' };
  }
  if (!uid) {
    return { ok: false, reason: 'not-signed-in' };
  }

  const ref = doc(getFirebaseDb(), 'config', 'admin');

  return runTransaction(getFirebaseDb(), async (transaction) => {
    const snap = await transaction.get(ref);

    if (!snap.exists()) {
      transaction.set(ref, {
        uid,
        email,
        username: username ?? null,
        claimedAt: new Date().toISOString(),
      });
      return { ok: true as const, isNewClaim: true };
    }

    const data = snap.data() as AdminConfig;
    if (data.uid === uid) {
      return { ok: true as const, isNewClaim: false };
    }

    return { ok: false as const, reason: 'denied' as const };
  }) as Promise<AdminAccessResult>;
}

async function countCollection(name: string): Promise<number | null> {
  const db = getFirebaseDb();
  try {
    const snap = await getCountFromServer(collection(db, name));
    return snap.data().count;
  } catch {
    try {
      const docs = await getDocs(collection(db, name));
      return docs.size;
    } catch {
      return null;
    }
  }
}

export interface AdminUserSummary {
  uid: string;
  email: string;
  username: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
}

function firestoreTimestampToIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/** List registered accounts for the admin panel. */
export async function fetchSignedUpUsers(): Promise<AdminUserSummary[]> {
  if (!isFirebaseConfigured()) return [];

  const db = getFirebaseDb();
  const byUid = new Map<string, AdminUserSummary>();

  const [userSnaps, usernameSnaps] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'usernames')),
  ]);

  for (const docSnap of userSnaps.docs) {
    const data = docSnap.data() as {
      email?: string;
      username?: string;
      lastLoginAt?: unknown;
      createdAt?: unknown;
    };

    byUid.set(docSnap.id, {
      uid: docSnap.id,
      email: data.email?.trim() ?? '',
      username: data.username?.trim() || null,
      lastLoginAt: firestoreTimestampToIso(data.lastLoginAt),
      createdAt: firestoreTimestampToIso(data.createdAt),
    });
  }

  for (const docSnap of usernameSnaps.docs) {
    const data = docSnap.data() as { uid?: string; username?: string; createdAt?: unknown };
    const uid = data.uid?.trim();
    if (!uid) continue;

    const name = data.username?.trim() || docSnap.id;
    const existing = byUid.get(uid);
    if (existing) {
      if (!existing.username) existing.username = name;
    } else {
      byUid.set(uid, {
        uid,
        email: '',
        username: name,
        lastLoginAt: null,
        createdAt: firestoreTimestampToIso(data.createdAt),
      });
    }
  }

  return [...byUid.values()].sort((a, b) => {
    const aLabel = a.username ?? a.email ?? a.uid;
    const bLabel = b.username ?? b.email ?? b.uid;
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
  });
}

/** Count registered accounts — users collection, with usernames as fallback. */
export async function fetchSignedUpUserCount(): Promise<number> {
  if (!isFirebaseConfigured()) return 0;

  const [users, usernames] = await Promise.all([
    countCollection('users'),
    countCollection('usernames'),
  ]);

  return Math.max(users ?? 0, usernames ?? 0);
}
