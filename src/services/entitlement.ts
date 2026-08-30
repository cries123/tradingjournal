import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { limitsFor, MARKET_REPLAY_LIVE, type Tier, type TierLimits } from '../config/tiers';

export interface EntitlementUsage {
  aiMessagesUsed: number;
  aiMessagesRemaining: number;
  syncsUsed: number;
  syncsRemaining: number;
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

/** Sends the buyer to Creem's hosted checkout for a plan. */
export async function startCheckout(tier: Tier): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error('Sign in to upgrade your plan.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to upgrade your plan.');

  const token = await user.getIdToken();
  const res = await fetch('/api/creem-checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });

  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not start checkout.');
  return data.url;
}
