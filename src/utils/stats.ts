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

/** Cumulative net P&L by trading day in month — for sparklines. */
export function getCumulativePnlSeries(trades: Trade[], year: number, month: number): number[] {
  const daily = getDailyPnlForMonth(trades, year, month);
  let running = 0;
  return daily.map((d) => {
    running += d.pnl;
    return running;
  });
}

export type PerformancePeriod = 'day' | 'week' | 'month' | 'year' | 'all';

export interface PerformanceBucket {
  key: string;
  label: string;
  pnl: number;
}

export interface PerformanceResult {
  /** Net P&L for the "current" bucket (today / this week / this month / this year / all time). */
  headlinePnl: number;
  headlineTrades: number;
  /** Chronological buckets at the resolution appropriate for the period (see getPerformanceData). */
  buckets: PerformanceBucket[];
  /** Running total aligned with `buckets`, for an equity-curve line. */
  cumulative: number[];
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function finalizePerformance(buckets: PerformanceBucket[], headlinePnl: number, headlineTrades: number): PerformanceResult {
  let running = 0;
  const cumulative = buckets.map((b) => {
    running += b.pnl;
    return running;
  });
  return { headlinePnl, headlineTrades, buckets, cumulative };
}

const EMPTY_PERFORMANCE: PerformanceResult = { headlinePnl: 0, headlineTrades: 0, buckets: [], cumulative: [] };

/**
 * Builds the data behind the dashboard's "how am I doing" performance panel: a headline net P&L
 * for the current instance of the selected period, plus a bucketed series for the chart —
 * day/week/month/year each show a recent rolling window at their own resolution, and 'all' shows
 * the full monthly equity curve since the very first trade.
 */
export function getPerformanceData(trades: Trade[], period: PerformancePeriod, today: Date = new Date()): PerformanceResult {
  if (trades.length === 0) return EMPTY_PERFORMANCE;

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  if (period === 'day') {
    const WINDOW = 14;
    const buckets: PerformanceBucket[] = [];
    for (let i = WINDOW - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      buckets.push({ key: toISODate(d), label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), pnl: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const t of sorted) {
      const b = byKey.get(t.date);
      if (b) b.pnl += t.pnl;
    }

    const todayKey = toISODate(today);
    const headlinePnl = byKey.get(todayKey)?.pnl ?? 0;
    const headlineTrades = sorted.filter((t) => t.date === todayKey).length;
    return finalizePerformance(buckets, headlinePnl, headlineTrades);
  }

  if (period === 'week') {
    const WINDOW = 10;
    const thisWeekStart = startOfWeek(today);
    const buckets: PerformanceBucket[] = [];
    for (let i = WINDOW - 1; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setDate(start.getDate() - i * 7);
      buckets.push({ key: toISODate(start), label: `${start.getMonth() + 1}/${start.getDate()}`, pnl: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const t of sorted) {
      const wkKey = toISODate(startOfWeek(new Date(t.date + 'T12:00:00')));
      const wb = byKey.get(wkKey);
      if (wb) wb.pnl += t.pnl;
    }

    const currentKey = toISODate(thisWeekStart);
    const headlinePnl = byKey.get(currentKey)?.pnl ?? 0;
    const headlineTrades = sorted.filter((t) => toISODate(startOfWeek(new Date(t.date + 'T12:00:00'))) === currentKey).length;
    return finalizePerformance(buckets, headlinePnl, headlineTrades);
  }

  if (period === 'month') {
    const WINDOW = 12;
    const buckets: PerformanceBucket[] = [];
    for (let i = WINDOW - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTH_LABELS[d.getMonth()], pnl: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const t of sorted) {
      const key = t.date.slice(0, 7);
      const kb = byKey.get(key);
      if (kb) kb.pnl += t.pnl;
    }

    const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const headlinePnl = byKey.get(currentKey)?.pnl ?? 0;
    const headlineTrades = sorted.filter((t) => t.date.slice(0, 7) === currentKey).length;
    return finalizePerformance(buckets, headlinePnl, headlineTrades);
  }

  if (period === 'year') {
    const firstYear = Number(sorted[0].date.slice(0, 4));
    const lastYear = Math.max(today.getFullYear(), Number(sorted[sorted.length - 1].date.slice(0, 4)));
    const buckets: PerformanceBucket[] = [];
    for (let y = firstYear; y <= lastYear; y++) buckets.push({ key: String(y), label: String(y), pnl: 0 });
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const t of sorted) {
      const key = t.date.slice(0, 4);
      const kb = byKey.get(key);
      if (kb) kb.pnl += t.pnl;
    }

    const currentKey = String(today.getFullYear());
    const headlinePnl = byKey.get(currentKey)?.pnl ?? 0;
    const headlineTrades = sorted.filter((t) => t.date.slice(0, 4) === currentKey).length;
    return finalizePerformance(buckets, headlinePnl, headlineTrades);
  }

  // 'all' — full monthly equity curve since the first trade ever logged.
  const first = sorted[0].date;
  const cursor = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 1);
  const buckets: PerformanceBucket[] = [];
  while (cursor <= end) {
    buckets.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_LABELS[cursor.getMonth()]} '${String(cursor.getFullYear()).slice(2)}`,
      pnl: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const t of sorted) {
    const key = t.date.slice(0, 7);
    const kb = byKey.get(key);
    if (kb) kb.pnl += t.pnl;
  }

  const headlinePnl = sorted.reduce((s, t) => s + t.pnl, 0);
  return finalizePerformance(buckets, headlinePnl, sorted.length);
}

/** Daily win rate trend (rolling %) for sparklines. */
export function getWinRateSeries(trades: Trade[], year: number, month: number): number[] {
  const monthTrades = getMonthTrades(trades, year, month).sort((a, b) => a.date.localeCompare(b.date));
  const byDay = new Map<string, Trade[]>();
  for (const t of monthTrades) {
    const list = byDay.get(t.date) ?? [];
    list.push(t);
    byDay.set(t.date, list);
  }

  const series: number[] = [];
  let wins = 0;
  let total = 0;
  for (const [, dayTrades] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const t of dayTrades) {
      total += 1;
      if (t.pnl > 0) wins += 1;
    }
    series.push(total > 0 ? (wins / total) * 100 : 0);
  }
  return series;
}
