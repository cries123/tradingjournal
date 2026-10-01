import { getAdminFirestore } from './firebaseAdmin';
import { isTier, limitsFor, type Tier, type TierLimits } from '../src/config/tiers';
import { compIsLive, tierWithComp, type ComplimentaryAccess } from '../src/config/accessExtension';

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
  /**
   * Time-limited access given by hand, on top of whatever billing says.
   *
   * Kept apart from `tier`/`source` on purpose: those describe the subscription, and a webhook is
   * free to rewrite them. A comp survives that rewrite because the merge never touches it, and it
   * expires on its own because effectiveTier checks the date — nothing has to run to end it.
   */
  comp?: ComplimentaryAccess | null;
  /**
   * When this account started its free trial. Set once, never cleared.
   *
   * Kept here rather than inferred from `comp`, because a comp expires and is eventually
   * overwritten — and an account whose trial has run out looks, from every other field, exactly
   * like one that never had a trial. This is the only thing standing between one free week and
   * an unlimited supply of them.
   */
  trialStartedAt?: string | null;
  /**
   * What billing said before a hand-grant covered it over, so removing the grant can put it back.
   *
   * Written by handleSetTier only when it is overwriting a real purchase, and cleared the moment the
   * grant is removed. Without it, removing a grant left the granted tier recorded as an active
   * purchase: paid access nobody was paying for, phantom revenue in the run rate, and a refused
   * checkout for a customer trying to buy the plan they were already being told they had.
   */
  preGrant?: {
    tier: Tier;
    status: Entitlement['status'];
    /** Omitted rather than nulled, so restoring it matches the shape writeEntitlement merges. */
    currentPeriodEnd?: string;
  } | null;
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
 * What the subscription (or permanent grant) alone confers right now.
 *
 * A subscription that has been cancelled but is still inside its paid period keeps working — the
 * customer paid for that time. One that is past due or expired does not. Reading the tier through
 * this function rather than off the document is what stops an expired record granting access
 * forever because nothing ever ran to clear it.
 */
export function billingTier(e: Entitlement | null, now: number = Date.now()): Tier {
  if (!e) return 'free';
  if (e.status === 'active') return e.tier;

  if (e.status === 'canceled' && e.currentPeriodEnd) {
    const endsAt = Date.parse(e.currentPeriodEnd);
    if (Number.isFinite(endsAt) && endsAt > now) return e.tier;
  }
  return 'free';
}

/** The tier a record actually confers right now: billing, with any live complimentary access on top. */
export function effectiveTier(e: Entitlement | null, now: number = Date.now()): Tier {
  return tierWithComp(billingTier(e, now), e, now);
}

/**
 * Where the access is coming from, for the UI.
 *
 * 'comp' only when the complimentary access is doing work — giving a tier billing alone would
 * not. A paying Gold customer with a Gold comp stacked for later is still, today, a purchase, and
 * the pricing page must keep treating them as one.
 */
export function accessSource(e: Entitlement | null, now: number = Date.now()): 'purchase' | 'admin' | 'comp' | null {
  if (!e) return null;
  const fromBilling = billingTier(e, now);
  if (effectiveTier(e, now) !== fromBilling) return 'comp';
  return e.source;
}

/**
 * The tier the SUBSCRIPTION is for, whatever it currently confers.
 *
 * billingTier answers "what can they use", which is what nearly everything wants. This answers
 * "what did they buy", which only the account screen wants — and only because a declined payment
 * makes those two different. Without it, the line asking a Gold customer to update their card read
 * "update your card to keep Free".
 */
export function subscribedTier(e: Entitlement | null): Tier {
  return e?.tier ?? 'free';
}

/**
 * Whether there is a billing account to open a portal for.
 *
 * Decided here because only here knows: the browser was inferring it from the effective tier, which
 * is free for a past_due customer — so the one person who urgently needs the portal was shown no
 * way to reach it, on the same panel that told them to update their card.
 *
 * The test is ONLY whether Creem has heard of this account. It also required source 'purchase', which
 * trapped anybody who had bought a plan and was later given a grant by hand: the grant rewrites source
 * to 'admin' and leaves the subscription untouched, so the billing carried on while the portal link —
 * the one route to cancelling it — vanished from their account screen. An account with a Creem
 * customer id has something to manage whatever this app has since written over the top of it.
 *
 * Status is not consulted either. past_due and expired both still have a portal, which is the whole
 * point, and a cancelled customer may still want an invoice.
 *
 * creem-portal.ts has to agree with this, or the button reports an error for a living.
 */
export function canManageBilling(e: Entitlement | null): boolean {
  return Boolean(e?.creemCustomerId);
}

/** When the complimentary access runs out, if it is live. */
export function complimentaryUntil(e: Entitlement | null, now: number = Date.now()): string | null {
  return e && compIsLive(e.comp, now) ? e.comp.until : null;
}

/** A stored comp, or null for anything that is not one. A half-written record grants nothing. */
export function readComp(value: unknown): ComplimentaryAccess | null {
  const c = value as Partial<ComplimentaryAccess> | null | undefined;
  if (!c || !isTier(c.tier) || typeof c.until !== 'string' || !Number.isFinite(Date.parse(c.until))) return null;
  return {
    tier: c.tier,
    until: c.until,
    grantedBy: typeof c.grantedBy === 'string' ? c.grantedBy : '',
    grantedAt: typeof c.grantedAt === 'string' ? c.grantedAt : '',
    ...(typeof c.reason === 'string' && c.reason ? { reason: c.reason } : {}),
    ...(c.trial === true ? { trial: true } : {}),
  };
}

const STATUSES = ['active', 'canceled', 'past_due', 'expired'] as const;

/**
 * A stored pre-grant snapshot, or null for anything that is not one.
 *
 * Validated for the same reason readComp is, and with more at stake: clearing a grant writes this
 * straight back into the live entitlement, so a half-written or hand-edited value would become the
 * tier and status the account is served from. Anything unrecognised reads as "nothing was saved",
 * which falls back to clearing the status and letting the next webhook decide.
 */
export function readPreGrant(value: unknown): Entitlement['preGrant'] {
  const p = value as Partial<NonNullable<Entitlement['preGrant']>> | null | undefined;
  if (!p || !isTier(p.tier)) return null;
  if (!STATUSES.includes(p.status as (typeof STATUSES)[number])) return null;
  return {
    tier: p.tier,
    status: p.status as Entitlement['status'],
    ...(typeof p.currentPeriodEnd === 'string' ? { currentPeriodEnd: p.currentPeriodEnd } : {}),
  };
}

export async function readEntitlement(uid: string): Promise<Entitlement | null> {
  const snap = await entitlementDoc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<Entitlement>;
  if (!isTier(data.tier)) return null;
  return {
    ...DEFAULTS,
    ...data,
    tier: data.tier,
    comp: readComp(data.comp),
    preGrant: readPreGrant(data.preGrant),
    trialStartedAt: typeof data.trialStartedAt === 'string' ? data.trialStartedAt : null,
  } as Entitlement;
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
