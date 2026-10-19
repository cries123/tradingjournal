import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  annualBillingReady,
  parseBillingEvent,
  productForId,
  productIdForTier,
  tierForProductId,
} from '../../server/creemClient';
import { chargeAmount } from '../../server/billingLedger';
import { planChangeRoute } from '../../server/planChangeRoute';
import type { Entitlement } from '../../server/entitlements';
import { mrrMovement } from '../utils/mrrMovement';
import { annualPrice, TIER_PLANS } from '../config/tiers';

/*
 * Yearly plans, end to end through everything that has to know a charge covers twelve months.
 *
 * The pricing page has shown yearly prices for a while; nothing behind it could sell one. Checkout
 * only knew monthly products, a webhook for a yearly product matched no plan, and the revenue
 * figures would each have counted a yearly subscriber as one monthly payer who then stopped paying.
 */

const MONTHLY = {
  CREEM_PRODUCT_SILVER: 'prod_silver_m',
  CREEM_PRODUCT_GOLD: 'prod_gold_m',
  CREEM_PRODUCT_DIAMOND: 'prod_diamond_m',
};
const YEARLY = {
  CREEM_PRODUCT_SILVER_ANNUAL: 'prod_silver_y',
  CREEM_PRODUCT_GOLD_ANNUAL: 'prod_gold_y',
  CREEM_PRODUCT_DIAMOND_ANNUAL: 'prod_diamond_y',
};
const ALL_VARS = [...Object.keys(MONTHLY), ...Object.keys(YEARLY)];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ALL_VARS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, MONTHLY, YEARLY);
});

afterEach(() => {
  for (const k of ALL_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('the env var names', () => {
  it('are the ones tiers.ts names, so the instructions and the code agree', () => {
    // Guards this file's fixtures as much as the code: a renamed variable would make every test
    // below pass against names production never reads.
    expect(TIER_PLANS.silver.productIdEnv).toBe('CREEM_PRODUCT_SILVER');
    expect(TIER_PLANS.silver.annualProductIdEnv).toBe('CREEM_PRODUCT_SILVER_ANNUAL');
    expect(TIER_PLANS.diamond.annualProductIdEnv).toBe('CREEM_PRODUCT_DIAMOND_ANNUAL');
  });
});

describe('whether yearly can be sold', () => {
  it('is ready when every paid plan has its own yearly product', () => {
    expect(annualBillingReady()).toBe(true);
    expect(productIdForTier('gold', 'year')).toBe('prod_gold_y');
    expect(productIdForTier('gold')).toBe('prod_gold_m');
  });

  it('is not ready with one plan missing — yearly is all three or none', () => {
    delete process.env.CREEM_PRODUCT_DIAMOND_ANNUAL;
    expect(annualBillingReady()).toBe(false);
  });

  it('refuses a monthly id pasted into a yearly variable', () => {
    // It would pass a presence check and sell "a year" that bills every month.
    process.env.CREEM_PRODUCT_GOLD_ANNUAL = 'prod_gold_m';
    expect(annualBillingReady()).toBe(false);
  });

  it('is reported to the pricing page, and not as a missing setting', () => {
    const src = readFileSync('netlify/functions/payments-status.ts', 'utf8');
    expect(src).toMatch(/annualReady: apiKey && annualBillingReady\(\)/);
    // Optional products must not turn the admin panel's payments light red.
    expect(src).not.toMatch(/annualProducts\.[^\n]*missing/);
  });
});

describe('a webhook for a yearly product', () => {
  const event = (product: string, metadata: Record<string, unknown> = { uid: 'u1' }) => ({
    id: 'evt_1',
    eventType: 'subscription.paid',
    object: { id: 'sub_1', product, metadata, status: 'active' },
  });

  it('maps back to its plan and says it is yearly', () => {
    expect(productForId('prod_diamond_y')).toEqual({ tier: 'diamond', interval: 'year' });
    expect(tierForProductId('prod_diamond_y')).toBe('diamond');
    expect(parseBillingEvent(event('prod_diamond_y'))).toMatchObject({ tier: 'diamond', interval: 'year' });
  });

  it('still reads a monthly product as monthly', () => {
    expect(parseBillingEvent(event('prod_silver_m'))).toMatchObject({ tier: 'silver', interval: 'month' });
  });

  it('says nothing about the interval when the product is unknown, rather than guessing monthly', () => {
    // Guessing would overwrite a yearly record on a cancellation event that does not repeat the product.
    const parsed = parseBillingEvent(event('prod_unknown', { uid: 'u1', tier: 'gold' }));
    expect(parsed?.tier).toBe('gold');
    expect(parsed?.interval).toBeUndefined();
  });

  it('falls back to what checkout was started with when the product is missing', () => {
    expect(parseBillingEvent(event('', { uid: 'u1', tier: 'gold', interval: 'year' }))?.interval).toBe('year');
  });

  it('is written onto the entitlement only when the event said', () => {
    // The apply moved out of the function into server/creemApply.ts so the Ops tab can replay it.
    const src = readFileSync('server/creemApply.ts', 'utf8');
    expect(src).toContain('...(parsed.interval ? { billingInterval: parsed.interval } : {})');
  });
});

describe('a yearly charge with no amount on the event', () => {
  it('books the yearly price, not a tenth of it', () => {
    expect(chargeAmount('gold', null, 'year')).toBe(annualPrice('gold'));
    expect(chargeAmount('gold', null)).toBe(TIER_PLANS.gold.price);
  });

  it('still books exactly what the event said when it said', () => {
    expect(chargeAmount('gold', 0, 'year')).toBe(0);
    expect(chargeAmount('gold', 123, 'year')).toBe(123);
  });
});

describe('moving a live subscription', () => {
  const sub = (over: Partial<Entitlement> = {}): Entitlement => ({
    tier: 'gold',
    source: 'purchase',
    status: 'active',
    creemSubscriptionId: 'sub_123',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  });

  it('does not move a monthly subscription to yearly automatically', () => {
    expect(planChangeRoute(sub(), 'gold', 'year')).toEqual({ action: 'switch-interval', from: 'month', to: 'year' });
    expect(planChangeRoute(sub(), 'diamond', 'year')).toEqual({ action: 'switch-interval', from: 'month', to: 'year' });
  });

  it('treats a record from before yearly plans as monthly', () => {
    expect(planChangeRoute(sub({ billingInterval: undefined }), 'diamond')).toMatchObject({ action: 'change' });
  });

  it('moves a yearly subscription to another yearly plan the usual way', () => {
    expect(planChangeRoute(sub({ billingInterval: 'year' }), 'diamond', 'year')).toMatchObject({
      action: 'change',
      direction: 'upgrade',
    });
    expect(planChangeRoute(sub({ billingInterval: 'year' }), 'gold', 'year')).toMatchObject({ action: 'already-on-it' });
  });

  it('does not move a yearly subscription back to monthly either', () => {
    expect(planChangeRoute(sub({ billingInterval: 'year' }), 'gold', 'month')).toEqual({
      action: 'switch-interval',
      from: 'year',
      to: 'month',
    });
  });

  it('still sells a fresh yearly checkout to somebody with no subscription', () => {
    expect(planChangeRoute(null, 'gold', 'year')).toEqual({ action: 'checkout' });
  });
});

describe('the paying-customer movement panel', () => {
  const months = (keys: string[]) => keys.map((month) => ({ month, counts: { revenue: 0 } }));

  it('does not report a yearly subscriber as having stopped paying the month after they paid', () => {
    const rows = mrrMovement(months(['2026-01', '2026-02', '2026-03']), [
      { uid: 'yearly', at: '2026-01-15T00:00:00Z', interval: 'year' },
    ]);
    expect(rows.map((r) => r.churned)).toEqual([0, 0, 0]);
    expect(rows.map((r) => r.newCustomers)).toEqual([1, 0, 0]);
  });

  it('reports them once the year is up and they did not renew', () => {
    const keys = Array.from({ length: 14 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
    const rows = mrrMovement(months(keys), [{ uid: 'yearly', at: '2026-01-15T00:00:00Z', interval: 'year' }]);
    // Covered January to December 2026, gone in January 2027.
    expect(rows.find((r) => r.month === '2026-12')?.churned).toBe(0);
    expect(rows.find((r) => r.month === '2027-01')?.churned).toBe(1);
  });

  it('counts a year that runs across New Year correctly', () => {
    const rows = mrrMovement(months(['2026-11', '2026-12', '2027-01', '2027-10', '2027-11']), [
      { uid: 'y', at: '2026-11-02T00:00:00Z', interval: 'year' },
    ]);
    expect(rows.find((r) => r.month === '2027-10')?.churned).toBe(0);
    expect(rows.find((r) => r.month === '2027-11')?.churned).toBe(1);
  });

  it('leaves monthly payers exactly as before', () => {
    const rows = mrrMovement(months(['2026-01', '2026-02']), [{ uid: 'm', at: '2026-01-15T00:00:00Z' }]);
    expect(rows.map((r) => r.churned)).toEqual([0, 1]);
  });
});
