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

  it('is named on the cheapest card that has it, and inherited above', () => {
    /*
     * The invariant changed when the cards stopped repeating themselves.
     *
     * This used to assert the performance screen was printed on Silver AND Diamond, which was
     * true only because every paid card relisted everything below it — "Everything in Gold"
     * followed by six lines the reader had already agreed to. Diamond no longer prints this one,
     * and that is correct: it is inherited. What must stay true is that the line appears exactly
     * once on the way up, on the first plan that includes it.
     */
    const mentions = (tier: Tier) =>
      featureLines(tier).some((l) => /performance screen/i.test(l.text));

    expect(mentions('free')).toBe(false);
    expect(mentions('silver')).toBe(true);

    // Above Silver it is covered by the inheritance line rather than reprinted.
    for (const tier of ['gold', 'diamond'] as Tier[]) {
      expect(mentions(tier), `${tier} reprints an inherited line`).toBe(false);
      expect(featureLines(tier)[0].text).toMatch(/^Everything in /);
    }
  });

  it('never reprints a line the plan below already showed', () => {
    // The dedup itself, over every tier rather than this one feature: a card that repeats what
    // the card beside it already said is the thing that made Diamond thirteen bullets deep.
    for (const tier of ['silver', 'gold', 'diamond'] as Tier[]) {
      const below = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
      const shown = new Set(featureLines(below).map((l) => l.text));
      const repeated = featureLines(tier)
        .slice(1)
        .filter((l) => shown.has(l.text))
        .map((l) => l.text);

      expect(repeated, `${tier} repeats: ${repeated.join(" | ")}`).toEqual([]);
    }
  });

  it('still shows a changed limit rather than swallowing it as a repeat', () => {
    // The other half of the rule, and the one a careless dedup breaks: "10 broker connections"
    // is a different sentence from "5 broker connections" and has to survive.
    const gold = featureLines('gold').map((l) => l.text);
    expect(gold).toContain('10 broker connections');
    expect(gold).toContain('10 trade syncs a day');
    expect(featureLines('diamond').map((l) => l.text)).toContain('24 trade syncs a day');
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
