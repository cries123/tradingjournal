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

export function getMonthTrades(trades: Trade[], year: number, month: number): Trade[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return trades.filter((t) => t.date.startsWith(prefix));
}

export interface MonthPnlPoint {
  month: number;
  label: string;
  pnl: number;
  tradeCount: number;
  tradingDays: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getMonthlyPnlForYear(trades: Trade[], year: number): MonthPnlPoint[] {
  const prefix = `${year}-`;
  const byMonth = new Map<number, { pnl: number; trades: Trade[]; days: Set<string> }>();

  for (let m = 0; m < 12; m++) {
    byMonth.set(m, { pnl: 0, trades: [], days: new Set() });
  }

  for (const trade of trades) {
    if (!trade.date.startsWith(prefix)) continue;
    const month = Number(trade.date.slice(5, 7)) - 1;
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    bucket.pnl += trade.pnl;
    bucket.trades.push(trade);
    bucket.days.add(trade.date);
  }

  return MONTH_LABELS.map((label, month) => {
    const bucket = byMonth.get(month)!;
    return {
      month,
      label,
      pnl: bucket.pnl,
      tradeCount: bucket.trades.length,
      tradingDays: bucket.days.size,
    };
  });
}

export function getYearTrades(trades: Trade[], year: number): Trade[] {
  const prefix = `${year}-`;
  return trades.filter((t) => t.date.startsWith(prefix));
}

