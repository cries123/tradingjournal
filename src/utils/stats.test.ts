import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { computeStats, getDailyPnlForMonth, getWeekdayPnl } from './stats';

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

describe('getDailyPnlForMonth', () => {
  const trades = [
    trade('2026-07-31', 999),
    trade('2026-08-03', 100),
    trade('2026-08-03', -40),
    trade('2026-08-14', 25),
    trade('2026-09-01', 888),
  ];

  it('keeps only the month asked for', () => {
    // month is zero-based; 7 is August. An off-by-one here silently charts the wrong month.
    const days = getDailyPnlForMonth(trades, 2026, 7);
    expect(days.map((d) => d.date)).toEqual(['2026-08-03', '2026-08-14']);
  });

  it('sums trades that share a day into one bar', () => {
    const days = getDailyPnlForMonth(trades, 2026, 7);
    expect(days[0].pnl).toBe(60);
  });

  it('returns days in date order', () => {
    const shuffled = [trade('2026-08-20', 1), trade('2026-08-02', 1), trade('2026-08-11', 1)];
    const days = getDailyPnlForMonth(shuffled, 2026, 7);
    expect(days.map((d) => d.date)).toEqual(['2026-08-02', '2026-08-11', '2026-08-20']);
  });

  it('is empty for a month with no trades', () => {
    expect(getDailyPnlForMonth(trades, 2026, 0)).toEqual([]);
  });
});

describe('getWeekdayPnl', () => {
  it('does not let a timezone shift a trade onto the wrong weekday', () => {
    // 2026-08-03 is a Monday. Parsing an ISO date string through the Date constructor treats it as
    // UTC midnight, which is the previous Sunday for anyone west of Greenwich — this user included.
    const days = getWeekdayPnl([trade('2026-08-03', 500)], 2026, 7);
    const monday = days.find((d) => d.label.startsWith('Mon'));
    const sunday = days.find((d) => d.label.startsWith('Sun'));
    expect(monday?.pnl).toBe(500);
    expect(sunday?.pnl ?? 0).toBe(0);
  });
});
