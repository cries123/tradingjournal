import type { Trade } from '../types';

export interface DayResult {
  date: string;
  pnl: number;
}

export interface SymbolResult {
  symbol: string;
  pnl: number;
  trades: number;
  winRate: number;
}

export interface StreakInfo {
  /** Positive = consecutive green days, negative = consecutive red days. */
  current: number;
  bestGreen: number;
  worstRed: number;
}

export interface TradingInsights {
  expectancyPerTrade: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  winRate: number;
  maxDrawdown: number;
  greenDays: number;
  redDays: number;
  greenDayRate: number;
  bestDay: DayResult | null;
  worstDay: DayResult | null;
  streaks: StreakInfo;
  topSymbols: SymbolResult[];
  bottomSymbols: SymbolResult[];
  /** Net P&L of the most recent 5 trading days. */
  recentNet: number;
  /** Net P&L of the 5 trading days before that (null when not enough history). */
  priorNet: number | null;
  /** Cumulative equity by trading day — for the sparkline. */
  equitySeries: number[];
}

export function computeTradingInsights(trades: Trade[]): TradingInsights | null {
  if (trades.length === 0) return null;

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl < 0);
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));

  const byDay = new Map<string, number>();
  for (const t of trades) {
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.pnl);
  }
  const days: DayResult[] = [...byDay.entries()]
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const greenDays = days.filter((d) => d.pnl > 0).length;
  const redDays = days.filter((d) => d.pnl < 0).length;
  const decidedDays = greenDays + redDays;

  let bestDay: DayResult | null = null;
  let worstDay: DayResult | null = null;
  for (const day of days) {
    if (day.pnl > 0 && (!bestDay || day.pnl > bestDay.pnl)) bestDay = day;
    if (day.pnl < 0 && (!worstDay || day.pnl < worstDay.pnl)) worstDay = day;
  }

  const streaks = computeStreaks(days);

  const bySymbol = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of trades) {
    const key = t.symbol.trim().toUpperCase() || '—';
    const entry = bySymbol.get(key) ?? { pnl: 0, trades: 0, wins: 0 };
    entry.pnl += t.pnl;
    entry.trades += 1;
    if (t.pnl > 0) entry.wins += 1;
    bySymbol.set(key, entry);
  }
  const symbolResults: SymbolResult[] = [...bySymbol.entries()].map(([symbol, s]) => ({
    symbol,
    pnl: s.pnl,
    trades: s.trades,
    winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
  }));
  const topSymbols = symbolResults
    .filter((s) => s.pnl > 0)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 3);
  const bottomSymbols = symbolResults
    .filter((s) => s.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 3);

  const recentDays = days.slice(-5);
  const priorDays = days.slice(-10, -5);
  const recentNet = recentDays.reduce((s, d) => s + d.pnl, 0);
  const priorNet = priorDays.length > 0 ? priorDays.reduce((s, d) => s + d.pnl, 0) : null;

  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equitySeries: number[] = [];
  for (const day of days) {
    running += day.pnl;
    equitySeries.push(running);
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    expectancyPerTrade: netPnl / trades.length,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    avgWin: winners.length > 0 ? grossProfit / winners.length : 0,
    avgLoss: losers.length > 0 ? grossLoss / losers.length : 0,
    winRate: (winners.length / trades.length) * 100,
    maxDrawdown,
    greenDays,
    redDays,
    greenDayRate: decidedDays > 0 ? (greenDays / decidedDays) * 100 : 0,
    bestDay,
    worstDay,
    streaks,
    topSymbols,
    bottomSymbols,
    recentNet,
    priorNet,
    equitySeries,
  };
}

function computeStreaks(days: DayResult[]): StreakInfo {
  let bestGreen = 0;
  let worstRed = 0;
  let runGreen = 0;
  let runRed = 0;

  for (const day of days) {
    if (day.pnl > 0) {
      runGreen += 1;
      runRed = 0;
      if (runGreen > bestGreen) bestGreen = runGreen;
    } else if (day.pnl < 0) {
      runRed += 1;
      runGreen = 0;
      if (runRed > worstRed) worstRed = runRed;
    }
    // Flat days (pnl === 0) don't break or extend streaks.
  }

  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const pnl = days[i].pnl;
    if (pnl === 0) continue;
    if (current === 0) {
      current = pnl > 0 ? 1 : -1;
    } else if (current > 0 && pnl > 0) {
      current += 1;
    } else if (current < 0 && pnl < 0) {
      current -= 1;
    } else {
      break;
    }
  }

  return { current, bestGreen, worstRed };
}
