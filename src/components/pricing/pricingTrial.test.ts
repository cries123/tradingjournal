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
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the trial on the pricing page', () => {
  it('is badged on every paid plan that carries one, for a visitor', () => {
    who.signedIn = false;
    const words = text(renderToString(createElement(PricingContent)));
    const badges = words.match(new RegExp(`${TRIAL_DAYS}-day free trial`, 'g')) ?? [];
    expect(badges).toHaveLength(PAID_TIERS.filter(hasTrial).length);
    expect(badges.length).toBe(3);
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
