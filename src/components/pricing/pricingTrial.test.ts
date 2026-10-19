import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PAID_TIERS, TIER_PLANS } from '../../config/tiers';
import { hasTrial, TRIAL_DAYS } from '../../config/trial';

/*
 * The pricing page's trial, per plan.
 *
 * It was Silver's alone — the badge and the "Try … free" button were gated on `tier === TRIAL_TIER`.
 * Every paid plan carries the trial now (config/trial.ts), and the landing page says so; this page
 * must say the same thing or the two contradict each other one click apart.
 */

const who = vi.hoisted(() => ({ signedIn: false }));

vi.mock('../../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));
vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: who.signedIn ? { uid: 'u1', email: 'trader@example.com' } : null, firebaseEnabled: true, loading: false }),
}));
vi.mock('../../context/useEntitlement', () => ({
  useEntitlement: () => ({
    tier: 'free',
    source: 'free',
    loaded: true,
    loading: false,
    trialAvailable: true,
    onTrial: false,
    trialEndsAt: null,
    canManageBilling: false,
    refresh: async () => undefined,
  }),
}));

// The page reads ?checkout=success off the URL in its first render.
vi.stubGlobal('window', { location: { search: '' } });

const { PricingContent } = await import('./PricingContent');
const { StartTrialButton } = await import('../plan/StartTrialButton');
const { canSkipTrial } = await import('../../services/entitlement');
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the trial on the pricing page', () => {
  it('is badged on every paid plan that carries one, for a visitor', () => {
    who.signedIn = false;
    const html = renderToString(createElement(PricingContent));
    // The badge on each card, not the sentence above them that also says it.
    const badges = html.match(new RegExp(`<span class="ml-auto rounded-full[^"]*">${TRIAL_DAYS}(<!-- -->)?-day free trial</span>`, 'g')) ?? [];
    expect(badges).toHaveLength(PAID_TIERS.filter(hasTrial).length);
    expect(badges.length).toBe(3);
    expect(text(html)).toContain(`Every paid plan starts with a ${TRIAL_DAYS}-day free trial, one per person`);
  });

  it('starts the trial of the plan on the card, not always Silver', () => {
    who.signedIn = true;
    const words = text(renderToString(createElement(PricingContent)));
    for (const tier of PAID_TIERS.filter(hasTrial)) {
      expect(words).toContain(`Try ${TIER_PLANS[tier].name} free for ${TRIAL_DAYS} days`);
      expect(words).toContain(`$${TIER_PLANS[tier].price}/month after`);
    }
  });
});

describe('skipping the trial', () => {
  it('is offered only where the plan can be bought without one', () => {
    // The no-trial product decides it. Without it, Creem puts the trial on every checkout of the
    // plan, so a "skip the trial" link would open a trial anyway.
    expect(canSkipTrial(null, 'gold')).toBe(false);
    const status = {
      ok: true,
      checkoutReady: true,
      webhookReady: true,
      testMode: false,
      missing: [],
      noTrialProducts: [
        { tier: 'silver' as const, name: 'Silver', envName: 'CREEM_PRODUCT_SILVER_NO_TRIAL', present: true },
        { tier: 'gold' as const, name: 'Gold', envName: 'CREEM_PRODUCT_GOLD_NO_TRIAL', present: false },
      ],
    };
    expect(canSkipTrial(status, 'silver')).toBe(true);
    expect(canSkipTrial(status, 'gold')).toBe(false);
    expect(canSkipTrial(status, 'diamond')).toBe(false);
  });

  it('sits under the trial button, at the plan’s own price, and only when asked for', () => {
    who.signedIn = true;
    const withSkip = text(renderToString(createElement(StartTrialButton, { tier: 'gold', skipTrial: true })));
    expect(withSkip).toContain('Try Gold free for');
    expect(withSkip).toContain(`Or skip the trial and pay $${TIER_PLANS.gold.price} today`);
    const without = text(renderToString(createElement(StartTrialButton, { tier: 'gold' })));
    expect(without).not.toContain('skip the trial');
  });

  it('is wired to the plan’s no-trial product on the pricing page', () => {
    // payments-status arrives after the first render, so this is checked at the source: the link's
    // switch is canSkipTrial for the card's own plan, and the checkout asks for trial: false.
    const page = readFileSync('src/components/pricing/PricingContent.tsx', 'utf8');
    expect(page).toContain('skipTrial={canSkipTrial(payments, tier)}');
    const button = readFileSync('src/components/plan/StartTrialButton.tsx', 'utf8');
    expect(button).toContain("choosePlan(tier, 'month', trial ? {} : { trial: false })");
  });
});
