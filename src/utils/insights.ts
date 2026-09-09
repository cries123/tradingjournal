import type { Trade } from '../types';
import { tradeTags } from './tradeHelpers';
import { toDateKey } from './format';

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

export interface SetupResult {
  setup: string;
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
  topSetups: SetupResult[];
  bottomSetups: SetupResult[];
  /** Net P&L of the most recent 5 trading days. */
  recentNet: number;
  /** Net P&L of the 5 trading days before that (null when not enough history). */
  priorNet: number | null;
  /** Cumulative equity by trading day — for the sparkline. */
  equitySeries: number[];

  /* ---- the numbers the bigger journals lead with, which this one was missing ---- */

  tradeCount: number;
  netPnl: number;
  /** Sum of the winners, before the losers are taken off. */
  grossProfit: number;
  /** Sum of the losers, as a positive number. */
  grossLoss: number;
  /** avgWin ÷ avgLoss. 0 when there are no losses to divide by. */
  payoff: number;
  /**
   * The win rate this payoff needs just to break even.
   *
   * The single most clarifying number a losing journal can be shown: "you win 37%" says nothing
   * until it sits next to "and you need 44%". 0 when there is nothing to compute it from.
   */
  requiredWinRate: number;
  /** winRate − requiredWinRate. Negative is the whole problem, in one figure. */
  edgeGap: number;
  /**
   * Net profit ÷ the deepest drawdown.
   *
   * How much the account made for the worst stretch it had to sit through. Below 1 means the
   * drawdown was bigger than the year's profit, which is the number that decides whether somebody
   * can actually keep trading a system, not whether it makes money on paper.
   */
  recoveryFactor: number;
  /** Share of gross profit that came from the single best day, in percent. */
  bestDayShare: number;
  /** Share of gross profit that came from the three biggest trades, in percent. */
  topTradesShare: number;
  /** Expectancy per trade over the most recent window (see EXPECTANCY_WINDOW). */
  recentExpectancy: number;
  /** The same window immediately before it, or null when there isn't one. */
  priorExpectancy: number | null;
}

/**
 * Trades in a rolling expectancy window.
 *
 * Twenty is small enough that a change shows up inside a fortnight of active trading and large
 * enough that one outsized trade doesn't invent a trend. The point of the pair is that a single
 * all-time expectancy hides a working system that stopped working a month ago.
 */
export const EXPECTANCY_WINDOW = 20;

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

  const bySetup = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of trades) {
    for (const tag of tradeTags(t)) {
      const key = tag.trim();
      if (!key) continue;
      const entry = bySetup.get(key) ?? { pnl: 0, trades: 0, wins: 0 };
      entry.pnl += t.pnl;
      entry.trades += 1;
      if (t.pnl > 0) entry.wins += 1;
      bySetup.set(key, entry);
    }
  }
  const setupResults: SetupResult[] = [...bySetup.entries()].map(([setup, s]) => ({
    setup,
    pnl: s.pnl,
    trades: s.trades,
    winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
  }));
  const topSetups = setupResults
    .filter((s) => s.pnl > 0)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 3);
  const bottomSetups = setupResults
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

  const avgWin = winners.length > 0 ? grossProfit / winners.length : 0;
  const avgLoss = losers.length > 0 ? grossLoss / losers.length : 0;
  const winRate = (winners.length / trades.length) * 100;
  const payoff = avgLoss > 0 ? avgWin / avgLoss : 0;
  const requiredWinRate = avgWin + avgLoss > 0 ? (avgLoss / (avgWin + avgLoss)) * 100 : 0;

  /* Chronological, so "the last twenty trades" means the last twenty rather than whichever twenty
     the caller's array happened to end with. Sorted by date only: a same-day ordering would need a
     clock time that plenty of brokerages never send. */
  const chronological = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const recentWindow = chronological.slice(-EXPECTANCY_WINDOW);
  const priorWindow = chronological.slice(-EXPECTANCY_WINDOW * 2, -EXPECTANCY_WINDOW);
  const windowExpectancy = (window: Trade[]) =>
    window.length > 0 ? window.reduce((s, t) => s + t.pnl, 0) / window.length : 0;

  const biggestWins = winners
    .map((t) => t.pnl)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);

  return {
    expectancyPerTrade: netPnl / trades.length,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    avgWin,
    avgLoss,
    winRate,
    maxDrawdown,
    greenDays,
    redDays,
    greenDayRate: decidedDays > 0 ? (greenDays / decidedDays) * 100 : 0,
    bestDay,
    worstDay,
    streaks,
    topSymbols,
    bottomSymbols,
    topSetups,
    bottomSetups,
    recentNet,
    priorNet,
    equitySeries,
    tradeCount: trades.length,
    netPnl,
    grossProfit,
    grossLoss,
    payoff,
    requiredWinRate,
    edgeGap: winRate - requiredWinRate,
    // Zero rather than Infinity when nothing was ever given back: a drawdown-free period is not
    // infinitely good, it is a period too short or too lucky to have a recovery factor yet.
    recoveryFactor: maxDrawdown > 0 ? netPnl / maxDrawdown : 0,
    bestDayShare: grossProfit > 0 && bestDay ? (bestDay.pnl / grossProfit) * 100 : 0,
    topTradesShare: grossProfit > 0 ? (biggestWins / grossProfit) * 100 : 0,
    recentExpectancy: windowExpectancy(recentWindow),
    priorExpectancy: priorWindow.length >= EXPECTANCY_WINDOW ? windowExpectancy(priorWindow) : null,
  };
}

export interface WeeklyRecap {
  net: number;
  greenDays: number;
  redDays: number;
  tradeCount: number;
  bestDay: DayResult | null;
  worstDay: DayResult | null;
  topSetup: SetupResult | null;
  /** Net P&L of the 7 days before this window (null when no history). */
  prevNet: number | null;
}

/** Recap of the last 7 calendar days vs the 7 before that. */
export function computeWeeklyRecap(trades: Trade[], now = new Date()): WeeklyRecap | null {
  const dayKey = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    return toDateKey(d);
  };
  const weekStart = dayKey(6);
  const prevStart = dayKey(13);

  const thisWeek = trades.filter((t) => t.date >= weekStart && t.date <= dayKey(0));
  if (thisWeek.length === 0) return null;
  const prevWeek = trades.filter((t) => t.date >= prevStart && t.date < weekStart);

  const byDay = new Map<string, number>();
  for (const t of thisWeek) {
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.pnl);
  }
  const days: DayResult[] = [...byDay.entries()].map(([date, pnl]) => ({ date, pnl }));

  let bestDay: DayResult | null = null;
  let worstDay: DayResult | null = null;
  for (const day of days) {
    if (day.pnl > 0 && (!bestDay || day.pnl > bestDay.pnl)) bestDay = day;
    if (day.pnl < 0 && (!worstDay || day.pnl < worstDay.pnl)) worstDay = day;
  }

  const bySetup = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of thisWeek) {
    for (const tag of tradeTags(t)) {
      const entry = bySetup.get(tag) ?? { pnl: 0, trades: 0, wins: 0 };
      entry.pnl += t.pnl;
      entry.trades += 1;
      if (t.pnl > 0) entry.wins += 1;
      bySetup.set(tag, entry);
    }
  }
  let topSetup: SetupResult | null = null;
  for (const [setup, s] of bySetup) {
    if (!topSetup || s.pnl > topSetup.pnl) {
      topSetup = {
        setup,
        pnl: s.pnl,
        trades: s.trades,
        winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
      };
    }
  }

  return {
    net: thisWeek.reduce((s, t) => s + t.pnl, 0),
    greenDays: days.filter((d) => d.pnl > 0).length,
    redDays: days.filter((d) => d.pnl < 0).length,
    tradeCount: thisWeek.length,
    bestDay,
    worstDay,
    topSetup,
    prevNet: prevWeek.length > 0 ? prevWeek.reduce((s, t) => s + t.pnl, 0) : null,
  };
}

/**
 * Consecutive days journaled, counting back from today (or yesterday if
 * today has no entries yet). Weekends don't break the streak.
 */
export function computeJournalingStreak(trades: Trade[], now = new Date()): number {
  if (trades.length === 0) return 0;
  const journaled = new Set(trades.map((t) => t.date));

  const cursor = new Date(now);
  const todayKey = toDateKey(cursor);
  if (!journaled.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const key = toDateKey(cursor);
    const weekday = cursor.getDay();
    if (journaled.has(key)) {
      streak++;
    } else if (weekday !== 0 && weekday !== 6) {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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
