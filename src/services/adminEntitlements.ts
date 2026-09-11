import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import { isTier, type Tier } from '../config/tiers';
import { compIsLive, higherTier, type AccessRecord, type ComplimentaryAccess } from '../config/accessExtension';

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

/**
 * The tier the subscription alone gives right now, mirroring the server's billingTier.
 *
 * A cancelled subscription keeps its tier until the period already paid for runs out — the whole
 * reason this is not just `record.tier`. Anything else (past_due, expired) is treated as Free,
 * which is what the server does when it decides whether to serve a request.
 */
export function billingTierOf(record: AdminEntitlementView | null, now: number): Tier {
  if (!record) return 'free';
  if (record.status === 'active') return record.tier;
  if (record.status === 'canceled' && record.currentPeriodEnd) {
    const ends = Date.parse(record.currentPeriodEnd);
    if (Number.isFinite(ends) && ends > now) return record.tier;
  }
  return 'free';
}

/**
 * What the account actually has right now — the better of its subscription and any live comp.
 *
 * This is the number worth showing anywhere a person is being judged by their plan. `record.tier`
 * on its own is the stored value, which reads Gold for somebody whose card failed in June and
 * Free for somebody who was comped Diamond yesterday. Both are wrong answers to "what do they
 * have", and the admin panel is exactly where acting on a wrong one costs something.
 */
export function effectiveTierOf(record: AdminEntitlementView | null, now: number): Tier {
  const comp = record && compIsLive(record.comp, now) ? record.comp.tier : 'free';
  return higherTier(billingTierOf(record, now), comp);
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
  return readEntitlementDoc(snap.data() as Partial<AdminEntitlementView>);
}

function readEntitlementDoc(data: Partial<AdminEntitlementView>): AdminEntitlementView | null {
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

/**
 * Every entitlement at once, keyed by uid, so a list of users can show its plans.
 *
 * One collection read rather than one document per row: the rules already let an admin list this
 * collection, and 42 users fetched individually is 42 round trips behind a spinner. There is one
 * document per account that has ever paid or been granted anything — far fewer than the user
 * count, since a free account that never touched billing has no document here at all. A uid
 * missing from this map is Free, and that is the common case rather than an error.
 */
export async function fetchAllEntitlements(): Promise<Map<string, AdminEntitlementView>> {
  const byUid = new Map<string, AdminEntitlementView>();
  if (!isFirebaseConfigured()) return byUid;

  const snap = await getDocs(collection(getFirebaseDb(), 'entitlements'));
  for (const docSnap of snap.docs) {
    const record = readEntitlementDoc(docSnap.data() as Partial<AdminEntitlementView>);
    if (record) byUid.set(docSnap.id, record);
  }
  return byUid;
}
