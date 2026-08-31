import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { limitsFor, MARKET_REPLAY_LIVE, type Tier, type TierLimits } from '../config/tiers';

export interface EntitlementUsage {
  aiMessagesUsed: number;
  aiMessagesRemaining: number;
  syncsUsed: number;
  syncsRemaining: number;
  /** ISO timestamp of the next allowance reset (midnight US Eastern). Absent on older responses. */
  resetsAt?: string;
}

export interface EntitlementSnapshot {
  tier: Tier;
  limits: TierLimits;
  marketReplayLive: boolean;
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  source: 'purchase' | 'admin' | null;
  currentPeriodEnd: string | null;
  usage: EntitlementUsage;
}

/** What a signed-out visitor sees. Also the fall-back when the plan can't be loaded. */
export const FREE_SNAPSHOT: EntitlementSnapshot = {
  tier: 'free',
  limits: limitsFor('free'),
  marketReplayLive: MARKET_REPLAY_LIVE,
  status: 'active',
  source: null,
  currentPeriodEnd: null,
  usage: { aiMessagesUsed: 0, aiMessagesRemaining: 0, syncsUsed: 0, syncsRemaining: 0 },
};

export async function fetchEntitlement(): Promise<EntitlementSnapshot> {
  if (!isFirebaseConfigured()) return FREE_SNAPSHOT;
  const user = getFirebaseAuth().currentUser;
  if (!user) return FREE_SNAPSHOT;

  const token = await user.getIdToken();
  const res = await fetch('/api/entitlement', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Could not load your plan');
  return (await res.json()) as EntitlementSnapshot;
}

/**
 * A checkout failure that came back with the payment provider's own explanation.
 *
 * The server only attaches `detail` for the site admin, so this being set at all means the person
 * looking at the screen is the one who can fix it.
 */
export class CheckoutError extends Error {
  detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'CheckoutError';
    this.detail = detail;
  }
}

/**
 * What happened when the user chose a plan.
 *
 * Two different outcomes, because someone who already subscribes has their existing subscription
 * moved rather than buying a second one — no checkout page, no redirect, the plan just changes.
 */
export type PlanChoiceResult =
  | { kind: 'checkout'; url: string }
  | { kind: 'changed'; tier: Tier; message: string };

/** Buys a plan, or moves an existing subscription onto it. The server decides which. */
export async function choosePlan(tier: Tier): Promise<PlanChoiceResult> {
  if (!isFirebaseConfigured()) throw new Error('Sign in to upgrade your plan.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to upgrade your plan.');

  const token = await user.getIdToken();
  const res = await fetch('/api/creem-checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });

  const data = (await res.json()) as {
    url?: string;
    changed?: boolean;
    tier?: Tier;
    message?: string;
    error?: string;
    detail?: string;
  };

  if (!res.ok) throw new CheckoutError(data.error ?? 'Could not start checkout.', data.detail);
  if (data.changed && data.tier) {
    return { kind: 'changed', tier: data.tier, message: data.message ?? 'Your plan has changed.' };
  }
  if (data.url) return { kind: 'checkout', url: data.url };
  throw new CheckoutError('Could not start checkout.', data.detail);
}

/** Opens Creem's billing portal, where the customer changes their card or cancels. */
export async function openBillingPortal(): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error('Sign in first.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');

  const token = await user.getIdToken();
  const res = await fetch('/api/creem-portal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not open the billing portal.');
  return data.url;
}

export interface PaymentsStatus {
  ok: boolean;
  checkoutReady: boolean;
  webhookReady: boolean;
  testMode: boolean;
  missing: string[];
}

/** Public, unauthenticated: which payment env vars the server can see. Booleans and names only. */
export async function fetchPaymentsStatus(): Promise<PaymentsStatus | null> {
  try {
    const res = await fetch('/api/payments-status');
    if (!res.ok) return null;
    return (await res.json()) as PaymentsStatus;
  } catch {
    return null;
  }
}
