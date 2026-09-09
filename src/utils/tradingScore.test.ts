import { describe, expect, it } from 'vitest';
import type { TradingInsights } from './insights';
import { bandFor, computeTradingScore, RELIABLE_SAMPLE, scale } from './tradingScore';

const base: TradingInsights = {
  expectancyPerTrade: 0,
  profitFactor: 1,
  avgWin: 100,
  avgLoss: 100,
  winRate: 50,
  maxDrawdown: 0,
  greenDays: 5,
  redDays: 5,
  greenDayRate: 50,
  bestDay: null,
  worstDay: null,
  streaks: { current: 0, bestGreen: 0, worstRed: 0 },
  topSymbols: [],
  bottomSymbols: [],
  topSetups: [],
  bottomSetups: [],
  recentNet: 0,
  priorNet: null,
  equitySeries: [],
  tradeCount: 100,
  netPnl: 0,
  grossProfit: 1000,
  grossLoss: 1000,
  payoff: 1,
  requiredWinRate: 50,
  edgeGap: 0,
  recoveryFactor: 0,
  bestDayShare: 20,
  topTradesShare: 30,
  recentExpectancy: 0,
  priorExpectancy: null,
};

const insights = (over: Partial<TradingInsights> = {}): TradingInsights => ({ ...base, ...over });

describe('scale', () => {
  it('maps the floor to nothing and the target to full marks', () => {
    expect(scale(0.7, 0.7, 2)).toBe(0);
    expect(scale(2, 0.7, 2)).toBe(100);
  });

  it('clamps at both ends rather than running past them', () => {
    // A profit factor of 6 over thirty trades is sample size, not six times the skill of a 2.
    expect(scale(6, 0.7, 2)).toBe(100);
    expect(scale(-4, 0.7, 2)).toBe(0);
  });

  it('is linear in between', () => {
    expect(scale(1.35, 0.7, 2)).toBeCloseTo(50, 6);
  });

  it('handles an infinite metric without producing NaN', () => {
    expect(scale(Infinity, 0.7, 2)).toBe(100);
    expect(scale(-Infinity, 0.7, 2)).toBe(0);
  });
});

describe('bandFor', () => {
  it('names each band at its boundary', () => {
    expect(bandFor(80)).toBe('Strong');
    expect(bandFor(79)).toBe('Solid');
    expect(bandFor(60)).toBe('Solid');
    expect(bandFor(59)).toBe('Developing');
    expect(bandFor(40)).toBe('Developing');
    expect(bandFor(39)).toBe('Needs work');
  });
});

describe('computeTradingScore', () => {
  it('says nothing about a handful of trades', () => {
    expect(computeTradingScore(insights({ tradeCount: 9 }))).toBeNull();
    expect(computeTradingScore(insights({ tradeCount: 10 }))).not.toBeNull();
  });

  it('scores a strong record above a weak one', () => {
    const strong = computeTradingScore(
      insights({
        winRate: 55,
        requiredWinRate: 35,
        edgeGap: 20,
        payoff: 2.4,
        profitFactor: 2.6,
        recoveryFactor: 4,
        greenDayRate: 72,
        bestDayShare: 15,
      }),
    );
    const weak = computeTradingScore(
      insights({
        winRate: 30,
        requiredWinRate: 55,
        edgeGap: -25,
        payoff: 0.55,
        profitFactor: 0.6,
        recoveryFactor: -1,
        greenDayRate: 30,
        bestDayShare: 70,
      }),
    );

    expect(strong!.total).toBeGreaterThan(weak!.total);
    expect(strong!.band).toBe('Strong');
    expect(weak!.band).toBe('Needs work');
  });

  it('scores edge on the gap to breakeven, not on the win rate alone', () => {
    // The whole reason win rate is not a component: a 30% hit rate with a 4:1 payoff is a good
    // system, and a 60% hit rate that needs 70% is not.
    const lowWinRateGoodEdge = computeTradingScore(insights({ winRate: 30, edgeGap: 8 }));
    const highWinRateBadEdge = computeTradingScore(insights({ winRate: 60, edgeGap: -12 }));

    const edgeOf = (s: ReturnType<typeof computeTradingScore>) =>
      s!.components.find((c) => c.id === 'edge')!.score;

    expect(edgeOf(lowWinRateGoodEdge)).toBeGreaterThan(edgeOf(highWinRateBadEdge));
  });

  it('penalises consistency when one day carries the profit', () => {
    // Identical green-day rates; the difference is that one trader made it all on a Tuesday.
    const even = computeTradingScore(insights({ greenDayRate: 65, bestDayShare: 20 }));
    const lumpy = computeTradingScore(insights({ greenDayRate: 65, bestDayShare: 75 }));

    const consistencyOf = (s: ReturnType<typeof computeTradingScore>) =>
      s!.components.find((c) => c.id === 'consistency')!.score;

    expect(consistencyOf(even)).toBeGreaterThan(consistencyOf(lumpy));
    expect(consistencyOf(lumpy)).toBeGreaterThanOrEqual(0);
  });

  it('never returns a component outside 0–100', () => {
    const extreme = computeTradingScore(
      insights({
        edgeGap: -900,
        payoff: 0,
        profitFactor: 0,
        recoveryFactor: -50,
        greenDayRate: 0,
        bestDayShare: 100,
      }),
    );
    for (const component of extreme!.components) {
      expect(component.score).toBeGreaterThanOrEqual(0);
      expect(component.score).toBeLessThanOrEqual(100);
    }
    expect(extreme!.total).toBe(0);
  });

  it('survives an infinite profit factor from a period with no losses', () => {
    const flawless = computeTradingScore(
      insights({ profitFactor: Infinity, grossLoss: 0, payoff: 0, tradeCount: 40 }),
    );
    expect(Number.isFinite(flawless!.total)).toBe(true);
    expect(flawless!.components.find((c) => c.id === 'profit-factor')!.detail).toBe('No losses yet');
  });

  it('flags a sample too thin to read hard', () => {
    expect(computeTradingScore(insights({ tradeCount: RELIABLE_SAMPLE - 1 }))!.thin).toBe(true);
    expect(computeTradingScore(insights({ tradeCount: RELIABLE_SAMPLE }))!.thin).toBe(false);
  });
});
