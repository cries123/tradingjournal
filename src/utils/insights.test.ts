import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { computeTradingInsights, EXPECTANCY_WINDOW } from './insights';

let counter = 0;
const trade = (pnl: number, date = '2026-08-03'): Trade =>
  ({ id: `t${counter++}`, date, symbol: 'SPY', pnl }) as Trade;

/** One trade per day, walking forward from the given date. */
const series = (pnls: number[], start = 1): Trade[] =>
  pnls.map((pnl, i) => trade(pnl, `2026-08-${String(start + i).padStart(2, '0')}`));

describe('computeTradingInsights — the numbers the bigger journals lead with', () => {
  it('computes the win rate the payoff ratio demands', () => {
    // Two wins of 200 against three losses of 100: payoff 2, so a third is enough.
    const insights = computeTradingInsights(series([200, 200, -100, -100, -100]))!;

    expect(insights.payoff).toBeCloseTo(2, 6);
    expect(insights.requiredWinRate).toBeCloseTo((100 / 300) * 100, 6);
    expect(insights.winRate).toBeCloseTo(40, 6);
    expect(insights.edgeGap).toBeCloseTo(40 - (100 / 300) * 100, 6);
  });

  it('reports a negative gap when the payoff cannot carry the hit rate', () => {
    const insights = computeTradingInsights(series([100, -300, -300]))!;
    expect(insights.edgeGap).toBeLessThan(0);
  });

  it('divides profit by the deepest drawdown for the recovery factor', () => {
    // Equity by day: 100, 0, 300. Peak 100, trough 0, so the drawdown is 100 and the net is 300.
    const insights = computeTradingInsights(series([100, -100, 300]))!;

    expect(insights.maxDrawdown).toBeCloseTo(100, 6);
    expect(insights.netPnl).toBeCloseTo(300, 6);
    expect(insights.recoveryFactor).toBeCloseTo(3, 6);
  });

  it('reports no recovery factor rather than an infinite one when nothing was given back', () => {
    // A period that only ever went up has no drawdown to recover from. Infinity here would render
    // as "∞×" and score full marks off a week of luck.
    const insights = computeTradingInsights(series([100, 100, 100]))!;
    expect(insights.recoveryFactor).toBe(0);
  });

  it('measures how much of the profit rode on the best day', () => {
    // Gross profit 1000, of which one day is 800.
    const insights = computeTradingInsights(series([800, 100, 100, -50]))!;
    expect(insights.grossProfit).toBeCloseTo(1000, 6);
    expect(insights.bestDayShare).toBeCloseTo(80, 6);
  });

  it('measures how much of the profit rode on the three biggest trades', () => {
    const insights = computeTradingInsights(series([500, 300, 100, 50, 50]))!;
    // 900 of 1000.
    expect(insights.topTradesShare).toBeCloseTo(90, 6);
  });

  it('compares the last window of trades against the one before it', () => {
    const older = Array.from({ length: EXPECTANCY_WINDOW }, () => -100);
    const newer = Array.from({ length: EXPECTANCY_WINDOW }, () => 50);
    const insights = computeTradingInsights(series([...older, ...newer]))!;

    expect(insights.recentExpectancy).toBeCloseTo(50, 6);
    expect(insights.priorExpectancy).toBeCloseTo(-100, 6);
  });

  it('reads the windows chronologically, not in the order the array arrived', () => {
    // The journal hands trades over in whatever order storage returned them; a rolling window that
    // trusted that order would report the wrong end of the history as "recent".
    const chronological = series([
      ...Array.from({ length: EXPECTANCY_WINDOW }, () => -100),
      ...Array.from({ length: EXPECTANCY_WINDOW }, () => 50),
    ]);
    const shuffled = [...chronological].reverse();

    expect(computeTradingInsights(shuffled)!.recentExpectancy).toBeCloseTo(50, 6);
  });

  it('offers no prior window until there is a full one', () => {
    const insights = computeTradingInsights(series(Array.from({ length: 25 }, () => 10)))!;
    expect(insights.priorExpectancy).toBeNull();
  });

  it('returns null for an empty journal', () => {
    expect(computeTradingInsights([])).toBeNull();
  });
});
