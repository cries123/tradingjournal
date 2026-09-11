import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { lowestTierWith, TIER_PLANS, tierHas, type Feature } from '../../config/tiers';
import { TRIAL_TIER } from '../../config/trial';

/*
 * What the lock card offers, per feature.
 *
 * The trial belongs to Creem and is attached to the Silver product, so it grants Silver and
 * nothing above it. The lock card used to put "Try Silver free for 7 days — $9/month after"
 * under every feature it gated, including the assistant, which is Gold. That is a paywall
 * describing one plan and selling another: the trial goes through checkout and takes the card,
 * so somebody who accepted it paid $9 and came back to the same lock.
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

vi.mock('../../context/useEntitlement', () => ({
  useEntitlement: () => ({ has: () => false, loaded: true, marketReplayLive: false }),
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

  it('names Gold, not the Silver trial, on the assistant', () => {
    const html = cardFor('aiAssistant');
    expect(html).toContain('Unlock with Gold');
    expect(html).toContain('$19/month');
    expect(html).not.toContain('Try Silver free');
  });

  it('never offers a trial that would leave the feature locked', () => {
    for (const feature of FEATURES) {
      if (tierHas(TRIAL_TIER, feature)) continue;
      const html = cardFor(feature);
      expect(html, feature).not.toContain(`Try ${TIER_PLANS[TRIAL_TIER].name} free`);
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
