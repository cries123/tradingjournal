import { billingTier, freeGrantOverLiveBilling, subscribedTier, type Entitlement } from './entitlements';
import { TIER_ORDER, type BillingInterval, type Tier } from '../src/config/tiers';

export type PlanRoute =
  | { action: 'checkout' }
  | { action: 'change'; subscriptionId: string; direction: 'upgrade' | 'downgrade' }
  /** `needsPayment` when the subscription exists but is being dunned — a card problem, not a sale. */
  | { action: 'already-on-it'; needsPayment: boolean }
  /**
   * A live subscription asked to change how often it bills. Refused for now — see below.
   */
  | { action: 'switch-interval'; from: BillingInterval; to: BillingInterval }
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
export function planChangeRoute(
  entitlement: Entitlement | null,
  requested: Tier,
  interval: BillingInterval = 'month',
  now: number = Date.now(),
): PlanRoute {
  /*
   * A hand-granted PAID tier has no subscription behind it, and billing webhooks are forbidden from
   * touching it: selling a checkout here would take money and change nothing.
   *
   * A hand-set FREE is refused only while a subscription may still be live under it, so nobody is
   * sold a second one. Once that has ended, Free protects nothing and refusing would lock a former
   * customer out of buying again — a trial that expired and was then set to Free by hand was told
   * "your plan is set by hand" when they tried to come back. That path is a fresh checkout, and the
   * webhook replaces the Free (isProtectedGrant does not protect it).
   */
  if (entitlement?.source === 'admin' && entitlement.status === 'active') {
    if (entitlement.tier !== 'free' || freeGrantOverLiveBilling(entitlement, now)) {
      return { action: 'admin-granted', tier: entitlement.tier };
    }
    return { action: 'checkout' };
  }

  /*
   * What they BOUGHT, not what they can use today.
   *
   * This read effectiveTier, which is 'free' for a past_due customer — so a declined card made the
   * whole rule below conclude there was no subscription, and the customer was sold a SECOND live one
   * while the first was still being dunned. The question here is "does Creem have a subscription for
   * this account", and the effective tier cannot answer it.
   */
  const current = subscribedTier(entitlement);

  /*
   * Whether the processor still has something it could move.
   *
   * 'active' obviously. 'past_due' too: the subscription exists and is being retried, which is the
   * case that used to fall through to a second sale. 'canceled' only while the paid period is still
   * running — billingTier already encodes exactly that, and once the period is over Creem has ended
   * the subscription, so there is nothing to change and a fresh checkout is right. 'expired' is gone.
   */
  const stillAtTheProcessor =
    entitlement?.status === 'active' ||
    entitlement?.status === 'past_due' ||
    billingTier(entitlement, now) !== 'free';

  const movable =
    entitlement?.source === 'purchase' &&
    Boolean(entitlement.creemSubscriptionId) &&
    stillAtTheProcessor &&
    current !== 'free';

  if (!movable || !entitlement?.creemSubscriptionId) return { action: 'checkout' };

  /*
   * Monthly to yearly, or back, is not moved automatically.
   *
   * Moving a plan within one interval is a proration Creem documents and this app has used since
   * launch. Moving a live subscription across intervals means charging for a year against a month
   * already paid for, and how Creem prorates that has never been seen here. Getting it wrong
   * charges somebody twice, and a second checkout is the same mistake made more slowly. Support
   * does it by hand until it has been tried once with real money.
   *
   * A record from before yearly plans existed has no interval, and every one of those is monthly.
   */
  const currentInterval = entitlement.billingInterval ?? 'month';
  if (interval !== currentInterval) {
    return { action: 'switch-interval', from: currentInterval, to: interval };
  }

  if (requested === current) {
    return { action: 'already-on-it', needsPayment: entitlement.status === 'past_due' };
  }

  return {
    action: 'change',
    subscriptionId: entitlement.creemSubscriptionId,
    direction:
      TIER_ORDER.indexOf(requested) > TIER_ORDER.indexOf(current) ? 'upgrade' : 'downgrade',
  };
}
