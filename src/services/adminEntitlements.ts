import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import { isTier, type Tier } from '../config/tiers';

export interface AdminEntitlementView {
  tier: Tier;
  source: 'purchase' | 'admin';
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  currentPeriodEnd?: string;
  grantedBy?: string;
  updatedAt?: string;
}

/**
 * Reads one user's entitlement for the admin panel.
 *
 * Read straight from Firestore rather than through a function: the rules already let an admin
 * read any entitlement, and this is one document opened on demand when a user row is expanded.
 * No record at all means Free — nobody has ever paid or been granted anything.
 */
export async function fetchUserEntitlement(uid: string): Promise<AdminEntitlementView | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(doc(getFirebaseDb(), 'entitlements', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<AdminEntitlementView>;
  if (!isTier(data.tier)) return null;
  return {
    tier: data.tier,
    source: data.source === 'admin' ? 'admin' : 'purchase',
    status: data.status ?? 'active',
    currentPeriodEnd: data.currentPeriodEnd,
    grantedBy: data.grantedBy,
    updatedAt: data.updatedAt,
  };
}
