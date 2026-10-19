import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planCheckoutTrial } from '../../server/checkoutTrial';
import { checkoutProductId, noTrialProductIdForTier, productForId, repeatTrialsBlocked } from '../../server/creemClient';
import { productProblems } from '../../server/trialProductCheck';
import { refuse, TRIAL_DAYS, TRIAL_TIERS, type TrialDecision } from '../config/trial';
import { PAID_TIERS } from '../config/tiers';

/*
 * A free trial on every plan, and one per person across all of them.
 *
 * Jay: "i want it setup like silver" (the trial on each plan's own Creem product), "nobody can get
 * all the free trials right?", and "after the trial is over itll automatically charge for the real
 * tier".
 *
 * Creem gives the trial to every new subscription of a product that has one, so before this the
 * eligibility rules only decided whether a trial BUTTON showed. The ordinary buy button went to the
 * same product, and Silver's week, then Gold's, then Diamond's were each one cancellation apart.
 */

const ELIGIBLE: TrialDecision = { eligible: true, tier: 'silver', days: TRIAL_DAYS, until: '2026-10-26T00:00:00.000Z' };

describe('every paid plan has the trial', () => {
  it('lists all three', () => {
    expect([...TRIAL_TIERS].sort()).toEqual([...PAID_TIERS].sort());
  });
});

describe('whether a checkout carries the trial', () => {
  it('gives a first-timer the trial on any plan', () => {
    for (const tier of PAID_TIERS) expect(planCheckoutTrial(ELIGIBLE, tier, 'month', true)).toEqual({ action: 'checkout', trial: true });
  });

  it('sends anybody who has had a trial, or been a customer, to the plan with none', () => {
    for (const reason of ['already-used', 'subscribed-before', 'email-already-used', 'already-comped'] as const) {
      for (const tier of PAID_TIERS) {
        expect(planCheckoutTrial(refuse(reason), tier, 'month', true), `${reason} ${tier}`).toEqual({ action: 'checkout', trial: false });
      }
    }
  });

  it('changes nothing for a plan whose no-trial copy is not set up yet', () => {
    // Nowhere else to send them, so checkout behaves exactly as it did before the copies existed.
    expect(planCheckoutTrial(refuse('already-used'), 'gold', 'month', false)).toEqual({ action: 'checkout', trial: true });
    expect(planCheckoutTrial(refuse('email-unverified'), 'gold', 'month', false)).toEqual({ action: 'checkout', trial: true });
  });

  it('asks an unconfirmed address to confirm, rather than charging a first-timer on day one', () => {
    const plan = planCheckoutTrial(refuse('email-unverified'), 'diamond', 'month', true);
    expect(plan.action).toBe('confirm-email');
    expect(plan.action === 'confirm-email' && plan.message).toContain(`${TRIAL_DAYS}-day free trial`);
  });

  it('gives the trial when eligibility could not be checked: a lost dollar beats a broken promise', () => {
    expect(planCheckoutTrial(null, 'silver', 'month', true)).toEqual({ action: 'checkout', trial: true });
  });

  it('never puts a trial on a yearly plan', () => {
    expect(planCheckoutTrial(ELIGIBLE, 'gold', 'year', true)).toEqual({ action: 'checkout', trial: false });
  });
});

describe('which Creem product a checkout sells', () => {
  const ENV: Record<string, string> = {
    CREEM_PRODUCT_SILVER: 'prod_silver',
    CREEM_PRODUCT_GOLD: 'prod_gold',
    CREEM_PRODUCT_DIAMOND: 'prod_diamond',
    CREEM_PRODUCT_SILVER_NO_TRIAL: 'prod_silver_nt',
    CREEM_PRODUCT_GOLD_NO_TRIAL: 'prod_gold_nt',
    CREEM_PRODUCT_DIAMOND_NO_TRIAL: 'prod_diamond_nt',
  };
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sells the plan’s own product, which carries the trial, to a first-timer', () => {
    expect(checkoutProductId('gold', 'month', true)).toBe('prod_gold');
  });

  it('sells the no-trial copy to somebody who has had a trial', () => {
    expect(checkoutProductId('gold', 'month', false)).toBe('prod_gold_nt');
    expect(checkoutProductId('diamond', 'month', false)).toBe('prod_diamond_nt');
  });

  it('falls back to the plan’s own product when the copy is not set', () => {
    vi.stubEnv('CREEM_PRODUCT_GOLD_NO_TRIAL', '');
    expect(checkoutProductId('gold', 'month', false)).toBe('prod_gold');
    expect(repeatTrialsBlocked()).toBe(false);
  });

  it('books a subscription to a no-trial copy as that plan, monthly', () => {
    // Otherwise the webhook would not know whose plan it was, and a paying customer would stay Free.
    expect(productForId('prod_diamond_nt')).toEqual({ tier: 'diamond', interval: 'month' });
    expect(productForId('prod_silver')).toEqual({ tier: 'silver', interval: 'month' });
  });

  it('refuses a copy whose id is one of the real products, pasted into the wrong variable', () => {
    // It would send returning customers straight back to the trial while looking finished.
    vi.stubEnv('CREEM_PRODUCT_GOLD_NO_TRIAL', 'prod_gold');
    expect(noTrialProductIdForTier('gold')).toBeNull();
    expect(repeatTrialsBlocked()).toBe(false);
  });

  it('is fully blocked only when all three copies are set', () => {
    expect(repeatTrialsBlocked()).toBe(true);
  });
});

describe('the Creem products, against what the site promises', () => {
  const product = (over: Partial<Parameters<typeof productProblems>[1] & object> = {}) => ({
    price: 1900,
    recurringInterval: 'month',
    trialPeriodDays: TRIAL_DAYS,
    trialPrice: null,
    status: 'active',
    ...over,
  });

  it('passes a plan whose own product has the free trial and whose copy has none', () => {
    expect(productProblems('gold', product(), true)).toEqual([]);
    expect(productProblems('gold', product({ trialPeriodDays: null }), false)).toEqual([]);
  });

  it('says when a plan’s product has no trial, or the wrong length, or a paid one', () => {
    expect(productProblems('gold', product({ trialPeriodDays: null }), true).join(' ')).toContain('Has no free trial');
    expect(productProblems('gold', product({ trialPeriodDays: 14 }), true).join(' ')).toContain(`14-day trial; the site promises ${TRIAL_DAYS} days`);
    expect(productProblems('gold', product({ trialPrice: 100 }), true).join(' ')).toContain('Its trial costs $1');
  });

  it('says when day 8 would charge something other than the plan', () => {
    // Jay: "after the trial is over itll automatically charge for the real tier".
    const line = productProblems('diamond', product({ price: 1900 }), true).join(' ');
    expect(line).toContain('Priced $19; Diamond is $39 a month');
    expect(line).toContain('day 8');
    expect(productProblems('gold', product({ recurringInterval: 'year' }), true).join(' ')).toContain('not monthly');
  });

  it('says when the no-trial copy has a trial, which would let returning customers have another', () => {
    expect(productProblems('silver', product({ price: 900 }), false).join(' ')).toContain('returning customers still get one');
  });

  it('names a copy that is not set up, and a product Creem would not return', () => {
    expect(productProblems('gold', null, false).join(' ')).toContain("take Gold's again");
    expect(productProblems('gold', new Error('Creem returned 404'), true).join(' ')).toContain('Creem returned 404');
  });
});

describe('the wiring', () => {
  const code = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('decides the trial in checkout before a new checkout is created, and passes it on', () => {
    const checkout = code('netlify/functions/creem-checkout.ts');
    expect(checkout).toContain('trialEligibility(uid');
    expect(checkout).toContain('trial: trialPlan.trial');
    expect(checkout.indexOf('planCheckoutTrial(')).toBeLessThan(checkout.indexOf('await createCheckout('));
  });

  it('chooses the product through the one tested function', () => {
    expect(code('server/creemClient.ts')).toContain("checkoutProductId(args.tier, interval, args.trial !== false)");
  });

  it('reports the copies and the Creem check where the owner looks', () => {
    expect(code('netlify/functions/payments-status.ts')).toContain('repeatTrialsBlocked: repeatTrialsBlocked()');
    expect(code('server/adminOpsHandler.ts')).toContain('readTrialProductCheck()');
  });
});

describe('reading a product from Creem', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('reads the trial and the price, trying the query form when the documented path is not found', async () => {
    vi.stubEnv('CREEM_API_KEY', 'creem_test_key');
    vi.resetModules();
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (url.includes('/products/')) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify({ price: 3900, recurring_interval: 'month', trial_period_days: 7, trial_price: null, status: 'active' }), { status: 200 });
    });
    const { getProductFacts } = await import('../../server/creemClient');
    const facts = await getProductFacts('prod_diamond');
    expect(facts).toEqual({ price: 3900, recurringInterval: 'month', trialPeriodDays: 7, trialPrice: null, status: 'active' });
    expect(urls).toEqual(['https://test-api.creem.io/v1/products/prod_diamond', 'https://test-api.creem.io/v1/products?product_id=prod_diamond']);
  });
});
