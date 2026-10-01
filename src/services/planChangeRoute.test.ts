import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planChangeRoute } from '../../server/planChangeRoute';
import { canManageBilling, readPreGrant, type Entitlement } from '../../server/entitlements';
import { DAY_MS } from '../config/accessExtension';

/*
 * Which plan action a customer gets, and the one rule with money attached: somebody who already
 * subscribes must have their existing subscription MOVED, never be sold a second one.
 *
 * This module's own doc comment said every branch was worth testing directly, "rather than through a
 * handler that needs Firestore and a live payment API to run at all" — and then there were no tests
 * at all. Two ways to be sold a second live subscription got in through that gap, and both of them
 * are states a real customer reaches without doing anything unusual.
 */

const NOW = Date.now();
const iso = (days: number) => new Date(NOW + days * DAY_MS).toISOString();

const sub = (over: Partial<Entitlement> = {}): Entitlement => ({
  tier: 'gold',
  source: 'purchase',
  status: 'active',
  creemSubscriptionId: 'sub_123',
  creemCustomerId: 'cus_123',
  updatedAt: iso(0),
  ...over,
});

describe('a customer with no subscription', () => {
  it('is sent to checkout', () => {
    expect(planChangeRoute(null, 'silver')).toEqual({ action: 'checkout' });
  });

  it('is sent to checkout on a free record', () => {
    expect(planChangeRoute(sub({ tier: 'free', creemSubscriptionId: undefined }), 'gold')).toEqual({
      action: 'checkout',
    });
  });

  it('is sent to checkout when the record names a tier but no subscription', () => {
    // A record can carry a tier with nothing at the processor behind it — a cleared grant, an import.
    // There is nothing to move, so a sale is right.
    expect(planChangeRoute(sub({ creemSubscriptionId: undefined }), 'diamond')).toEqual({
      action: 'checkout',
    });
  });
});

describe('a customer whose card has just been declined', () => {
  /*
   * THE BUG. past_due leaves the subscription live at Creem and being retried, while making the
   * EFFECTIVE tier free — and this rule was reading the effective tier. So a declined card made it
   * conclude there was no subscription, and the customer was sold a second live one on top of the one
   * still being dunned. The pricing page offers exactly that button: `subscribed` is false for them,
   * so the plan card renders "Add Gold to cart".
   */
  const declined = sub({ status: 'past_due' });

  it('is not sold a second subscription for the plan they already have', () => {
    const route = planChangeRoute(declined, 'gold');
    expect(route.action).not.toBe('checkout');
    expect(route).toEqual({ action: 'already-on-it', needsPayment: true });
  });

  it('is told it is a card problem rather than told they are already on it', () => {
    // The difference between a message that helps and a 409 that reads like a bug. The handler words
    // it from this flag.
    const route = planChangeRoute(declined, 'gold');
    expect(route.action === 'already-on-it' && route.needsPayment).toBe(true);
  });

  it('has an upgrade MOVED rather than opened alongside the unpaid one', () => {
    expect(planChangeRoute(declined, 'diamond')).toEqual({
      action: 'change',
      subscriptionId: 'sub_123',
      direction: 'upgrade',
    });
  });

  it('can still reach the billing portal, which is where the card gets fixed', () => {
    expect(canManageBilling(declined)).toBe(true);
  });
});

describe('a customer who has cancelled', () => {
  it('still has their subscription moved while the paid period runs', () => {
    // It exists at the processor until the period ends, so a second checkout inside that window is
    // the double-billing case.
    const cancelled = sub({ status: 'canceled', currentPeriodEnd: iso(10) });
    expect(planChangeRoute(cancelled, 'diamond')).toEqual({
      action: 'change',
      subscriptionId: 'sub_123',
      direction: 'upgrade',
    });
  });

  it('is sent to checkout once the period is over', () => {
    /*
     * The case the old effective-tier read got RIGHT and a naive switch to the subscribed tier would
     * have broken: past the period end Creem has ended the subscription, so there is nothing to move
     * and asking it to change one would fail.
     */
    const lapsed = sub({ status: 'canceled', currentPeriodEnd: iso(-10) });
    expect(planChangeRoute(lapsed, 'gold')).toEqual({ action: 'checkout' });
  });

  it('is sent to checkout when the record has expired outright', () => {
    expect(planChangeRoute(sub({ status: 'expired' }), 'gold')).toEqual({ action: 'checkout' });
  });
});

describe('an active subscriber', () => {
  it('is told when they ask for the plan they are on', () => {
    expect(planChangeRoute(sub(), 'gold')).toEqual({ action: 'already-on-it', needsPayment: false });
  });

  it('is moved up', () => {
    expect(planChangeRoute(sub(), 'diamond')).toEqual({
      action: 'change',
      subscriptionId: 'sub_123',
      direction: 'upgrade',
    });
  });

  it('is moved down', () => {
    expect(planChangeRoute(sub(), 'silver')).toEqual({
      action: 'change',
      subscriptionId: 'sub_123',
      direction: 'downgrade',
    });
  });

  it('is never sent to checkout for any plan', () => {
    // The invariant the whole module exists for, asserted across the ladder rather than per case.
    for (const tier of ['free', 'silver', 'gold', 'diamond'] as const) {
      expect(planChangeRoute(sub(), tier).action, tier).not.toBe('checkout');
    }
  });
});

describe('a hand-granted plan', () => {
  it('is reported as granted rather than sold', () => {
    const granted = sub({ source: 'admin', tier: 'diamond', creemSubscriptionId: undefined });
    expect(planChangeRoute(granted, 'gold')).toEqual({ action: 'admin-granted', tier: 'diamond' });
  });

  it('is reported as granted even when it is a grant of FREE over a live subscription', () => {
    /*
     * THE OTHER BUG, and the worse one. isProtectedGrant deliberately does not protect a grant of
     * free — a free grant is not access worth protecting — so a Silver customer granted Free from the
     * admin plan grid reached this rule with their subscription id intact. The route came back
     * 'admin-granted', creem-checkout.ts handled only 'already-on-it' and 'change', and control fell
     * through to createCheckout: a SECOND live subscription, on an account whose portal link had also
     * just disappeared because the grant rewrote source to 'admin'.
     */
    const grantedFree = sub({ source: 'admin', tier: 'free' });
    expect(planChangeRoute(grantedFree, 'silver')).toEqual({ action: 'admin-granted', tier: 'free' });
  });

  it('still lets that customer reach the portal, because the billing is real', () => {
    const grantedFree = sub({ source: 'admin', tier: 'free' });
    expect(canManageBilling(grantedFree)).toBe(true);
  });

  it('is not treated as a grant once it has lapsed', () => {
    // Only an ACTIVE grant is in anybody's way; an old inactive one must not block a purchase.
    const stale = sub({ source: 'admin', status: 'expired', creemSubscriptionId: undefined });
    expect(planChangeRoute(stale, 'gold')).toEqual({ action: 'checkout' });
  });
});

describe('every route the checkout handler must answer', () => {
  it('is one of the four, so the handler switch can be exhaustive', () => {
    /*
     * The fall-through above was possible because one of these four had no branch. Listing them here
     * means adding a fifth without handling it shows up as a failing test rather than as a sale.
     */
    const seen = new Set<string>();
    seen.add(planChangeRoute(null, 'gold').action);
    seen.add(planChangeRoute(sub(), 'gold').action);
    seen.add(planChangeRoute(sub(), 'diamond').action);
    seen.add(planChangeRoute(sub({ source: 'admin' }), 'gold').action);

    expect([...seen].sort()).toEqual(['admin-granted', 'already-on-it', 'change', 'checkout']);
  });

  it('has a branch in the handler for each one', () => {
    /*
     * Asserted against the source because the handler is a Netlify function and vitest does not
     * collect it. This is the exact defect being pinned: 'admin-granted' was returned by the router
     * and had no branch, so control reached createCheckout at the bottom of the function and sold a
     * second subscription. A missing branch here is not a crash — it is a sale.
     */
    const handler = readFileSync('netlify/functions/creem-checkout.ts', 'utf8');

    for (const action of ['admin-granted', 'already-on-it', 'change'] as const) {
      expect(handler, action).toContain(`route.action === '${action}'`);
    }
    // And the past_due wording hangs off the flag rather than being guessed at the call site.
    expect(handler).toContain('route.needsPayment');
  });
});

describe('a stored pre-grant snapshot', () => {
  /*
   * Clearing a grant writes this back into the LIVE entitlement, so an unrecognised value would
   * become the tier and status the account is served from. Same reasoning as readComp, with more at
   * stake.
   */
  it('is read back when it is well formed', () => {
    expect(readPreGrant({ tier: 'silver', status: 'past_due', currentPeriodEnd: iso(5) })).toEqual({
      tier: 'silver',
      status: 'past_due',
      currentPeriodEnd: iso(5),
    });
  });

  it('is nothing at all when the tier or status is not one we know', () => {
    expect(readPreGrant({ tier: 'platinum', status: 'active' })).toBeNull();
    expect(readPreGrant({ tier: 'gold', status: 'paused' })).toBeNull();
    expect(readPreGrant({ tier: 'gold' })).toBeNull();
    expect(readPreGrant(null)).toBeNull();
    expect(readPreGrant('gold')).toBeNull();
  });

  it('drops a period end that is not a date string rather than restoring it', () => {
    expect(readPreGrant({ tier: 'gold', status: 'active', currentPeriodEnd: 12345 })).toEqual({
      tier: 'gold',
      status: 'active',
    });
  });
});
