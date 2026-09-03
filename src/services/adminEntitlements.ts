import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import { isTier, type Tier } from '../config/tiers';
import type { AccessRecord, ComplimentaryAccess } from '../config/accessExtension';

export interface AdminEntitlementView extends AccessRecord {
  tier: Tier;
  source: 'purchase' | 'admin';
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  currentPeriodEnd?: string;
  grantedBy?: string;
  updatedAt?: string;
  /** Time-limited access given by hand, if any. Checked against the clock by the reader. */
  comp?: ComplimentaryAccess | null;
}

function readComp(value: unknown): ComplimentaryAccess | null {
  const c = value as Partial<ComplimentaryAccess> | null | undefined;
  if (!c || !isTier(c.tier) || typeof c.until !== 'string' || !Number.isFinite(Date.parse(c.until))) return null;
  return {
    tier: c.tier,
    until: c.until,
    grantedBy: typeof c.grantedBy === 'string' ? c.grantedBy : '',
    grantedAt: typeof c.grantedAt === 'string' ? c.grantedAt : '',
    ...(typeof c.reason === 'string' && c.reason ? { reason: c.reason } : {}),
  };
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
    comp: readComp(data.comp),
  };
}
