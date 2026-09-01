import { describe, expect, it } from 'vitest';
import { COST_RATES, priceUsage, worstCaseMonthlyCost, type CostRates } from './costs';
import { TIER_PLANS } from './tiers';

const RATES: CostRates = {
  connectedUserMonth: 1,
  syncCall: 0.05,
  aiMessage: 0.0068,
  takeaway: 0.0045,
  creemPercent: 0.039,
  creemFlat: 0.4,
};

describe('priceUsage', () => {
  it('prices a month of real usage', () => {
    const out = priceUsage(
      { aiMessages: 100, takeaways: 40, syncs: 200, syncingUsers: 12, charges: 12, revenue: 120 },
      RATES,
    );
    expect(out.ai).toBeCloseTo(0.68);
    expect(out.syncs).toBeCloseTo(10);
    expect(out.connectedUsers).toBeCloseTo(12);
    // 3.9% of 120 = 4.68, plus 12 x 0.40 = 4.80
    expect(out.processor).toBeCloseTo(9.48);
    expect(out.total).toBeCloseTo(0.68 + 0.18 + 10 + 12 + 9.48);
  });

  it('charges the connection fee per person, not per sync', () => {
    const busy = priceUsage(
      { aiMessages: 0, takeaways: 0, syncs: 300, syncingUsers: 1, charges: 0, revenue: 0 },
      RATES,
    );
    expect(busy.connectedUsers).toBe(1);
  });

  it('costs nothing on a month with no usage', () => {
    const idle = priceUsage(
      { aiMessages: 0, takeaways: 0, syncs: 0, syncingUsers: 0, charges: 0, revenue: 0 },
      RATES,
    );
    expect(idle.total).toBe(0);
  });
});

describe('worstCaseMonthlyCost', () => {
  it('keeps every paid tier above water at full usage', () => {
    for (const tier of ['silver', 'gold', 'diamond'] as const) {
      const plan = TIER_PLANS[tier];
      const worst = worstCaseMonthlyCost(plan, RATES);
      expect(worst.total).toBeLessThan(plan.price);
    }
  });

  it('charges Silver nothing for AI, because Silver has none', () => {
    expect(worstCaseMonthlyCost(TIER_PLANS.silver, RATES).ai).toBe(0);
  });

  it('scales AI with the tier allowance', () => {
    const gold = worstCaseMonthlyCost(TIER_PLANS.gold, RATES);
    const diamond = worstCaseMonthlyCost(TIER_PLANS.diamond, RATES);
    expect(diamond.ai).toBeGreaterThan(gold.ai);
  });

  it('bills the free tier for takeaways but nothing else', () => {
    const free = worstCaseMonthlyCost(TIER_PLANS.free, RATES);
    expect(free.connectedUsers).toBe(0);
    expect(free.syncs).toBe(0);
    expect(free.processor).toBe(0);
    expect(free.takeaways).toBeGreaterThan(0);
  });

  it('ships with rates that keep the tiers profitable', () => {
    // Guards the defaults themselves, not just the maths — a rate edit that inverts a tier fails.
    for (const tier of ['silver', 'gold', 'diamond'] as const) {
      const plan = TIER_PLANS[tier];
      expect(worstCaseMonthlyCost(plan, COST_RATES).total).toBeLessThan(plan.price);
    }
  });
});
