import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { computeStats } from './stats';

const trade = (date: string, pnl: number, over: Partial<Trade> = {}): Trade =>
  ({ id: `${date}-${pnl}`, date, symbol: 'SPY', pnl, ...over }) as Trade;

describe('computeStats', () => {
  it('returns zeroes rather than NaN for an empty period', () => {
    // Every field here divides by trade count somewhere; an empty month is the common case for a
    // new account, and NaN reaches the UI as "NaN%".
    const s = computeStats([]);
    expect(s).toMatchObject({ netPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, tradingDays: 0 });
    expect(Object.values(s).every((v) => Number.isFinite(v))).toBe(true);
  });

  it('counts wins, losses and net across a period', () => {
    const s = computeStats([
      trade('2026-08-03', 100),
      trade('2026-08-03', -40),
      trade('2026-08-04', 60),
      trade('2026-08-05', -20),
    ]);
    expect(s.netPnl).toBe(100);
    expect(s.winningTrades).toBe(2);
    expect(s.losingTrades).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.totalTrades).toBe(4);
  });

  it('counts trading days by distinct date, not by trade', () => {
    // avgProfitPerDay is the number this feeds, and three trades in one session is one day of
    // trading. Counting trades instead would quietly divide a good day into three mediocre ones.
    const s = computeStats([
      trade('2026-08-03', 30),
      trade('2026-08-03', 30),
      trade('2026-08-03', 30),
      trade('2026-08-04', 10),
    ]);
    expect(s.tradingDays).toBe(2);
    expect(s.avgProfitPerDay).toBe(50);
  });

  it('does not divide by zero when a period has no losers', () => {
    const s = computeStats([trade('2026-08-03', 100), trade('2026-08-04', 50)]);
    expect(Number.isFinite(s.profitFactor)).toBe(true);
    expect(s.profitFactor).toBe(99.99);
    expect(Number.isFinite(s.avgRR)).toBe(true);
  });

  it('scores a breakeven trade as neither a win nor a loss', () => {
    const s = computeStats([trade('2026-08-03', 0), trade('2026-08-04', 100)]);
    expect(s.winningTrades).toBe(1);
    expect(s.losingTrades).toBe(0);
    expect(s.totalTrades).toBe(2);
    expect(s.winRate).toBe(50);
  });
});

