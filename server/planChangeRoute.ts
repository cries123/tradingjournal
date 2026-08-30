import { effectiveTier, type Entitlement } from './entitlements';
import { TIER_ORDER, type Tier } from '../src/config/tiers';

export type PlanRoute =
  | { action: 'checkout' }
  | { action: 'change'; subscriptionId: string; direction: 'upgrade' | 'downgrade' }
  | { action: 'already-on-it' }
  | { action: 'admin-granted'; tier: Tier };

/**
 * What should happen when someone picks a plan.
 *
 * Its own module, and pure, because the rule it encodes is the one with money attached: a customer
 * who already subscribes must have their existing subscription MOVED, never be sold a second one.
 * Getting this wrong bills someone twice a month and they find out on a statement, not on the
 * page — so it is worth being able to test every branch directly rather than through a handler
 * that needs Firestore and a live payment API to run at all.
 */
export function planChangeRoute(entitlement: Entitlement | null, requested: Tier): PlanRoute {
  // A hand-granted tier has no subscription behind it, and billing webhooks are forbidden from
  // touching it. Selling a checkout here would take money and change nothing.
  if (entitlement?.source === 'admin' && entitlement.status === 'active') {
    return { action: 'admin-granted', tier: entitlement.tier };
  }

  const current = effectiveTier(entitlement);

  // 'canceled' still counts: the subscription exists at the processor until the paid period ends,
  // so a second checkout during that window is exactly the double-billing case.
  const movable =
    entitlement?.source === 'purchase' &&
    Boolean(entitlement.creemSubscriptionId) &&
    (entitlement.status === 'active' || entitlement.status === 'canceled') &&
    current !== 'free';

  if (!movable || !entitlement?.creemSubscriptionId) return { action: 'checkout' };
  if (requested === current) return { action: 'already-on-it' };

  return {
    action: 'change',
    subscriptionId: entitlement.creemSubscriptionId,
    direction:
      TIER_ORDER.indexOf(requested) > TIER_ORDER.indexOf(current) ? 'upgrade' : 'downgrade',
  };
}
