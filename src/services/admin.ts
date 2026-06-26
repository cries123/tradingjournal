import { doc, getDoc, runTransaction } from 'firebase/firestore';
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
