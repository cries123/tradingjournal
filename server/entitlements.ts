import { getAdminFirestore } from './firebaseAdmin';
import { isTier, limitsFor, type Tier, type TierLimits } from '../src/config/tiers';

/**
 * What a user is entitled to, and why.
 *
 * Stored server-side and written only by the Admin SDK. The client can read its own record so the
 * UI knows what to show, but it can never write one — an entitlement the client could set is not
 * an entitlement, it's a suggestion.
 */
export interface Entitlement {
  tier: Tier;
  /**
   * 'purchase' came from a payment; 'admin' was granted by hand.
   *
   * This distinction is what makes grandfathering work. A billing webhook must never quietly
   * downgrade someone who was given a tier deliberately — so an admin grant is only ever changed
   * by another admin action.
   */
  source: 'purchase' | 'admin';
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  creemSubscriptionId?: string;
  creemCustomerId?: string;
  /** ISO date the paid period runs to. A canceled subscription stays usable until then. */
  currentPeriodEnd?: string;
  grantedBy?: string;
  updatedAt: string;
}

/*
 * Defaults filled in around a stored record's own fields.
 *
 * `source` is 'purchase' here, and that matters more than it looks. This object is spread UNDER a
 * stored document, so any field the document is missing is taken from it — and it used to say
 * 'admin'. That meant an entitlement written without an explicit source silently read as a
 * hand-granted account, which is the one state the rest of the system treats as untouchable:
 * checkout refuses to sell to it and the billing webhook refuses to update it. An unknown record
 * is not a grant. A real grant is always written with source 'admin' by hand, explicitly.
 */
const DEFAULTS: Entitlement = { tier: 'free', source: 'purchase', status: 'active', updatedAt: '' };

/**
 * A hand-granted tier the billing system must not touch.
 *
 * Only a PAID grant is protected. Someone "granted" free has been given nothing — there is no
 * subscription to preserve, so treating it as protected only ever blocks them from buying and
 * blocks a payment from applying if they somehow did.
 */
export function isProtectedGrant(entitlement: Entitlement | null): boolean {
  return (
    entitlement?.source === 'admin' &&
    entitlement.status === 'active' &&
    entitlement.tier !== 'free'
  );
}

function entitlementDoc(uid: string) {
  return getAdminFirestore().doc(`entitlements/${uid}`);
}

/**
 * The tier a record actually confers right now.
 *
 * A subscription that has been cancelled but is still inside its paid period keeps working — the
 * customer paid for that time. One that is past due or expired does not. Reading the tier through
 * this function rather than off the document is what stops an expired record granting access
 * forever because nothing ever ran to clear it.
 */
export function effectiveTier(e: Entitlement | null): Tier {
  if (!e) return 'free';
  if (e.status === 'active') return e.tier;

  if (e.status === 'canceled' && e.currentPeriodEnd) {
    const endsAt = Date.parse(e.currentPeriodEnd);
    if (Number.isFinite(endsAt) && endsAt > Date.now()) return e.tier;
  }
  return 'free';
}

export async function readEntitlement(uid: string): Promise<Entitlement | null> {
  const snap = await entitlementDoc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<Entitlement>;
  if (!isTier(data.tier)) return null;
  return { ...DEFAULTS, ...data, tier: data.tier } as Entitlement;
}

/** The tier and limits to enforce for this request. Falls back to free on any doubt. */
export async function resolveAccess(uid: string): Promise<{ tier: Tier; limits: TierLimits }> {
  try {
    const tier = effectiveTier(await readEntitlement(uid));
    return { tier, limits: limitsFor(tier) };
  } catch (err) {
    // Never grant paid access because a lookup failed. Free is the safe direction to fail.
    console.error('[entitlements] lookup failed, falling back to free:', err);
    return { tier: 'free', limits: limitsFor('free') };
  }
}

export async function writeEntitlement(uid: string, patch: Partial<Entitlement>): Promise<void> {
  // Undefined fields are stripped, not written. Two reasons, both load-bearing:
  //
  //   1. The Admin SDK REJECTS an undefined value outright ("Cannot use undefined as a Firestore
  //      value") unless ignoreUndefinedProperties is on, so a cancellation payload that omits a
  //      customer id would throw and the webhook would fail for a field nobody cares about.
  //   2. Merged with the field absent, whatever is already stored survives — which is how a
  //      `canceled` event that doesn't repeat current_period_end_date still leaves the paid-through
  //      date intact. Someone who cancelled mid-month keeps the month they paid for, which is what
  //      the pricing page promises them.
  const clean: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) clean[key] = value;
  }
  await entitlementDoc(uid).set(clean, { merge: true });
}

/**
 * Applies a billing update, unless the user was granted their tier by hand.
 *
 * Returns whether it wrote. Grandfathered accounts are deliberately immune: someone given Diamond
 * for free has no subscription, so a webhook about a lapsed or absent one must not take it away.
 */
export async function applyBillingUpdate(
  uid: string,
  patch: Partial<Entitlement>,
): Promise<{ applied: boolean; reason?: string }> {
  const existing = await readEntitlement(uid);
  if (isProtectedGrant(existing)) {
    return { applied: false, reason: 'admin grant is not overridden by billing' };
  }
  await writeEntitlement(uid, { ...patch, source: 'purchase' });
  return { applied: true };
}
