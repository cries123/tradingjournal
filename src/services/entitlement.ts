import { sendEmailVerification } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { getVisitorId } from './visitorAnalytics';
import { limitsFor, MARKET_REPLAY_LIVE, type Tier, type TierLimits } from '../config/tiers';

export interface EntitlementUsage {
  aiMessagesUsed: number;
  aiMessagesRemaining: number;
  syncsUsed: number;
  syncsRemaining: number;
  /** ISO timestamp of the next allowance reset (midnight US Eastern). Absent on older responses. */
  resetsAt?: string;
  /** Bonus units an admin added, already included in the remaining counts above. */
  aiCredits?: number;
  syncCredits?: number;
}

export interface EntitlementSnapshot {
  tier: Tier;
  limits: TierLimits;
  marketReplayLive: boolean;
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  /** 'comp' when complimentary access is what confers the tier — nothing to pay, nothing to cancel. */
  source: 'purchase' | 'admin' | 'comp' | null;
  currentPeriodEnd: string | null;
  /** When complimentary access runs out, if any is live. Absent on older responses. */
  complimentaryUntil?: string | null;
  /** This account has never had a free trial and could start one now. */
  trialAvailable?: boolean;
  /** Why the trial is not on offer, when it isn't. */
  trialBlockedReason?: string | null;
  trialBlockedMessage?: string | null;
  /** The live complimentary access is a self-serve trial, not a gift. */
  onTrial?: boolean;
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
  complimentaryUntil: null,
  trialAvailable: false,
  trialBlockedReason: null,
  trialBlockedMessage: null,
  onTrial: false,
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
  /** False while the owner has paused purchases from the admin panel. */
  checkoutEnabled?: boolean;
  /** What to tell buyers while paused. Empty when checkout is open. */
  maintenanceMessage?: string;
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

/**
 * Starts the free trial for the signed-in user.
 *
 * The server decides eligibility; this just asks. A 409 comes back when the account is not in a
 * state where a trial means anything — already paying, already comped, or has had one before —
 * and the message it carries is the one to show.
 */
export async function startFreeTrial(): Promise<{ tier: Tier; until: string; message: string }> {
  if (!isFirebaseConfigured()) throw new Error('Sign in to start your trial.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to start your trial.');

  // The browser's own id, the same one the visitor analytics use. Sent so a second trial from
  // one browser is visible to an admin; it is never a reason to refuse, because a shared browser
  // is a library computer or a couple at a kitchen table far more often than it is abuse.
  const visitorId = getVisitorId();

  const res = await fetch('/api/start-trial', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
      ...(visitorId ? { 'X-Visitor-Id': visitorId } : {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as {
    tier?: Tier;
    until?: string;
    message?: string;
    error?: string;
  };

  if (!res.ok || !data.tier || !data.until) {
    throw new Error(data.error ?? 'Could not start your trial.');
  }
  return { tier: data.tier, until: data.until, message: data.message ?? 'Your trial has started.' };
}

/**
 * Sends the confirmation link, then tells the caller whether it worked.
 *
 * Firebase rate-limits this per address, and the error it throws for "you have asked several
 * times in the last minute" is indistinguishable to a user from a real failure — so that one is
 * reported as success. The link is already in their inbox; sending another would not help.
 */
export async function resendEmailVerification(): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Sign in first.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  if (user.emailVerified) return;

  try {
    await sendEmailVerification(user);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/too-many-requests') return;
    throw new Error('Could not send the confirmation email. Try again in a minute.', { cause: err });
  }
}

/**
 * Re-reads the account from Firebase so a just-confirmed address is seen as confirmed.
 *
 * The verification link is opened in another tab, and nothing tells this one about it — the
 * cached token still says unverified until it is explicitly reloaded.
 */
export async function refreshEmailVerified(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  const user = getFirebaseAuth().currentUser;
  if (!user) return false;
  await user.reload();
  // Force a new ID token, or the server keeps seeing the old claims for up to an hour.
  await user.getIdToken(true);
  return getFirebaseAuth().currentUser?.emailVerified ?? false;
}
