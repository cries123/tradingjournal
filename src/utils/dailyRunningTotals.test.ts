import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { computeStats, dailyRunningTotals } from './stats';

const t = (date: string, pnl: number): Trade => ({ id: `${date}${pnl}`, date, symbol: 'SPY', pnl });

describe('dailyRunningTotals', () => {
  it('runs the period day by day in date order, whatever order the trades came in', () => {
    const cents = dailyRunningTotals([t('2026-09-14', 588), t('2026-09-08', -5), t('2026-09-08', 0.19), t('2026-09-28', -187)]).map((v) => Math.round(v * 100) / 100);
    expect(cents).toEqual([-4.81, 583.19, 396.19]);
  });

  it('ends at the period’s net, so the line and the figure beside it agree', () => {
    const trades = [t('2026-09-02', 120.5), t('2026-09-03', -80.25), t('2026-09-03', 10)];
    expect(dailyRunningTotals(trades).at(-1)).toBeCloseTo(computeStats(trades).netPnl);
  });
});

describe('computeStats green and red days', () => {
  it('counts a day by its net, and a flat day as neither', () => {
    const s = computeStats([t('2026-09-02', 50), t('2026-09-02', -20), t('2026-09-03', -10), t('2026-09-04', 5), t('2026-09-04', -5)]);
    expect(s.greenDays).toBe(1);
    expect(s.redDays).toBe(1);
    expect(s.tradingDays).toBe(3);
  });

  it('averages wins and losses in dollars, both positive', () => {
    const s = computeStats([t('2026-09-02', 100), t('2026-09-02', 300), t('2026-09-03', -50)]);
    expect(s.avgWin).toBe(200);
    expect(s.avgLoss).toBe(50);
  });
});
