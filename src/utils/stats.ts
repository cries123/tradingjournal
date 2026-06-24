import type { Trade } from '../types';

export interface TradingStats {
  netPnl: number;
  winRate: number;
  avgRR: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgProfitPerTrade: number;
  avgProfitPerDay: number;
  tradingDays: number;
}

export interface DailyPnlPoint {
  date: string;
  pnl: number;
  label: string;
}

export interface WeekdayPnlPoint {
  label: string;
  pnl: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function computeStats(trades: Trade[]): TradingStats {
  if (trades.length === 0) {
    return {
      netPnl: 0,
      winRate: 0,
      avgRR: 0,
      profitFactor: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgProfitPerTrade: 0,
      avgProfitPerDay: 0,
      tradingDays: 0,
    };
  }

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl < 0);
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const avgWin = winners.length ? grossProfit / winners.length : 0;
  const avgLoss = losers.length ? grossLoss / losers.length : 0;
  const tradingDays = new Set(trades.map((t) => t.date)).size;

  return {
    netPnl,
    winRate: (winners.length / trades.length) * 100,
    avgRR: avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? avgWin : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.99 : 0,
    totalTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    avgProfitPerTrade: netPnl / trades.length,
    avgProfitPerDay: tradingDays > 0 ? netPnl / tradingDays : 0,
    tradingDays,
  };
}

export function getDailyPnlForMonth(trades: Trade[], year: number, month: number): DailyPnlPoint[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const byDay = new Map<string, number>();

  for (const trade of trades) {
    if (!trade.date.startsWith(prefix)) continue;
    byDay.set(trade.date, (byDay.get(trade.date) ?? 0) + trade.pnl);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pnl]) => ({
      date,
      pnl,
      label: date.slice(5),
    }));
}

export function getWeekdayPnl(trades: Trade[], year: number, month: number): WeekdayPnlPoint[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const totals = new Array(7).fill(0);

  for (const trade of trades) {
    if (!trade.date.startsWith(prefix)) continue;
    const day = new Date(trade.date + 'T12:00:00').getDay();
    totals[day] += trade.pnl;
  }

  return WEEKDAYS.map((label, i) => ({ label, pnl: totals[i] }));
}

export function getMonthTrades(trades: Trade[], year: number, month: number): Trade[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return trades.filter((t) => t.date.startsWith(prefix));
}
