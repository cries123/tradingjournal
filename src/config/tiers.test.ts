import { describe, expect, it } from 'vitest';
import {
  featureLines,
  limitsFor,
  lowestTierWith,
  TIER_ORDER,
  tierAtLeast,
  tierHas,
  type Tier,
} from './tiers';

/**
 * The paywall boundaries, pinned.
 *
 * A mistake in either direction here is expensive: one way gives a paid feature away, the other
 * blocks somebody who paid for it. This file has quietly gained a third gate, so the boundaries
 * are worth asserting rather than re-reading.
 */
describe('performance analytics', () => {
  it('starts at Silver', () => {
    expect(lowestTierWith('performanceAnalytics')).toBe('silver');
  });

  it('is off for Free and on for every paid tier', () => {
    expect(tierHas('free', 'performanceAnalytics')).toBe(false);
    for (const tier of ['silver', 'gold', 'diamond'] as Tier[]) {
      expect(tierHas(tier, 'performanceAnalytics')).toBe(true);
    }
  });

  it('appears on every paid plan card and on none of the free one', () => {
    const mentions = (tier: Tier) =>
      featureLines(tier).some((l) => /performance screen/i.test(l.text));
    expect(mentions('free')).toBe(false);
    expect(mentions('silver')).toBe(true);
    expect(mentions('diamond')).toBe(true);
  });
});

describe('the other gates still sit where they did', () => {
  it('broker sync starts at Silver, the assistant at Gold, replay at Diamond', () => {
    expect(lowestTierWith('brokerSync')).toBe('silver');
    expect(lowestTierWith('aiAssistant')).toBe('gold');
    expect(lowestTierWith('marketReplay')).toBe('diamond');
  });

  it('does not hand Silver the assistant', () => {
    expect(tierHas('silver', 'aiAssistant')).toBe(false);
    expect(limitsFor('silver').aiMessagesPerDay).toBe(0);
  });

  it('withholds market replay until it works, even from the plan that includes it', () => {
    // The limit says Diamond has it; tierHas is what the UI asks, and it stays false until
    // MARKET_REPLAY_LIVE flips.
    expect(limitsFor('diamond').marketReplay).toBe(true);
    expect(tierHas('diamond', 'marketReplay')).toBe(false);
  });
});

describe('tier ordering', () => {
  it('every limit is non-decreasing as the price goes up', () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const lower = limitsFor(TIER_ORDER[i - 1]);
      const higher = limitsFor(TIER_ORDER[i]);
      expect(higher.brokers).toBeGreaterThanOrEqual(lower.brokers);
      expect(higher.syncsPerDay).toBeGreaterThanOrEqual(lower.syncsPerDay);
      expect(higher.aiMessagesPerDay).toBeGreaterThanOrEqual(lower.aiMessagesPerDay);
    }
  });

  it('tierAtLeast reads up the ladder, not down', () => {
    expect(tierAtLeast('gold', 'silver')).toBe(true);
    expect(tierAtLeast('silver', 'gold')).toBe(false);
    expect(tierAtLeast('silver', 'silver')).toBe(true);
  });
});
