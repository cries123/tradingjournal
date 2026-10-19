import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { lowestTierWith, TIER_ORDER, TIER_PLANS, tierHas, type Feature } from '../../config/tiers';
import { hasTrial, TRIAL_TIER } from '../../config/trial';

/*
 * What the lock card offers, per feature.
 *
 * The trial belongs to Creem and goes through checkout, so it grants the plan it is on and nothing
 * above it. When only Silver had one, the lock card put "Try Silver free for 7 days — $9/month
 * after" under every feature it gated, including the assistant, which is Gold: a paywall describing
 * one plan and selling another, and somebody who accepted it paid $9 and came back to the same lock.
 * Every paid plan carries the trial now, so the card offers the plan that unlocks the feature.
 *
 * These render the real component against a free account and read the button.
 */

vi.mock('../../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));

// Signed in, so the trial button is on offer wherever the component decides to show it. Signed
// out it falls back to the buy CTA on its own, which would pass these tests for the wrong reason.
vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, username: 'u1', loading: false, profileLoading: false }),
}));

/*
 * Eligible as well as signed in.
 *
 * The trial button now refuses to render for an account the server would refuse, because the
 * "you have already had one" rule fires for the first time: the Creem webhook records a trial, and
 * this card gates on the FEATURE being locked rather than on eligibility. Mutable so the last case
 * can flip it.
 */
let trialAvailable = true;

vi.mock('../../context/useEntitlement', () => ({
  useEntitlement: () => ({
    has: () => false,
    loaded: true,
    marketReplayLive: false,
    get trialAvailable() {
      return trialAvailable;
    },
  }),
}));

const { LockedFeature } = await import('./LockedFeature');

/*
 * The card's markup, with React's SSR text separators taken out.
 *
 * renderToString writes an empty HTML comment between adjacent text nodes so it can hydrate
 * them apart again, and it lands in the middle of every interpolated tier name — the button
 * serialises as "Unlock with <!-- -->Gold". Stripping those is the difference between asserting
 * on the copy and asserting on React's serialisation of it.
 */
function cardFor(feature: Feature): string {
  return renderToString(
    createElement(LockedFeature, {
      feature,
      title: 'Title',
      description: 'Description',
      children: createElement('div', null, 'preview'),
    }),
  ).replaceAll('<!-- -->', '');
}

/** Everything the lock card is used for, plus the ones it could be used for tomorrow. */
const FEATURES: Feature[] = [
  'brokerSync',
  'aiAssistant',
  'marketReplay',
  'performanceAnalytics',
  'autoSync',
  'coachSeat',
  'ruleAlerts',
  'aiReview',
];

describe('LockedFeature upgrade offer', () => {
  it('offers the trial for a feature the trial tier includes', () => {
    const html = cardFor('brokerSync');
    expect(html).toContain(`Try ${TIER_PLANS[TRIAL_TIER].name} free for`);
  });

  it('offers the Gold trial, not the Silver one, on the assistant', () => {
    // Every paid plan carries the trial now, so the card offers the plan that unlocks the feature.
    const html = cardFor('aiAssistant');
    expect(html).toContain('Try Gold free for');
    expect(html).toContain('$19/month');
    expect(html).not.toContain('Try Silver free');
  });

  it('only ever offers the trial of the plan that unlocks the feature', () => {
    for (const feature of FEATURES) {
      const needed = lowestTierWith(feature);
      const html = cardFor(feature);
      for (const tier of TIER_ORDER) {
        if (tier === needed && hasTrial(tier) && tierHas(tier, feature)) continue;
        expect(html, `${feature}: ${tier}`).not.toContain(`Try ${TIER_PLANS[tier].name} free`);
      }
    }
  });

  it('offers the buy button on a plan without a trial', () => {
    expect(hasTrial('free')).toBe(false);
    // Market replay is sold with Diamond but not shipped: no trial is offered for something that
    // would not unlock.
    expect(cardFor('marketReplay')).not.toContain('free for');
  });

  it('offers the buy button instead when the account has already had its trial', () => {
    /*
     * The card is drawn because the FEATURE is locked, which says nothing about eligibility. An
     * ex-triallist used to be promised a free week here and then sent to a pricing page that does
     * not offer one — and the button's own terms line says cancelling costs nothing, which would
     * have been false for them.
     */
    trialAvailable = false;
    try {
      const html = cardFor('brokerSync');
      expect(html).not.toContain(`Try ${TIER_PLANS[TRIAL_TIER].name} free for`);
      expect(html).toContain('Unlock with');
    } finally {
      trialAvailable = true;
    }
  });

  it('names the lowest tier that actually includes the feature', () => {
    for (const feature of FEATURES) {
      const needed = lowestTierWith(feature);
      // Market replay is sold but not shipped, so its card says "coming soon" instead of selling.
      if (!needed || feature === 'marketReplay') continue;
      const html = cardFor(feature);
      expect(html, feature).toContain(TIER_PLANS[needed].name);
    }
  });
});
