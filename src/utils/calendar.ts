import type { DailySummary, Trade, WeekSummary } from '../types';
import { toDateKey } from './format';

export interface CalendarDay {
  date: Date | null;
  summary: DailySummary | null;
}

export interface CalendarWeek {
  days: CalendarDay[];
  summary: WeekSummary;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function buildCalendarWeeks(
  year: number,
  month: number,
  summaries: Map<string, DailySummary>,
): CalendarWeek[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month);
  const weeks: CalendarWeek[] = [];
  let currentWeek: CalendarDay[] = [];

  for (let i = 0; i < firstDay; i++) {
    currentWeek.push({ date: null, summary: null });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = toDateKey(date);
    currentWeek.push({
      date,
      summary: summaries.get(key) ?? null,
    });

    if (currentWeek.length === 7) {
      weeks.push({ days: currentWeek, summary: summarizeWeek(currentWeek) });
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: null, summary: null });
    }
    weeks.push({ days: currentWeek, summary: summarizeWeek(currentWeek) });
  }

  return weeks;
}

function summarizeWeek(days: CalendarDay[]): WeekSummary {
  let totalPnl = 0;
  let tradeCount = 0;

  for (const day of days) {
    if (day.summary) {
      totalPnl += day.summary.totalPnl;
      tradeCount += day.summary.tradeCount;
    }
  }

  return { weekIndex: 0, totalPnl, tradeCount };
}

export function aggregateTradesByDay(trades: Trade[]): Map<string, DailySummary> {
  const map = new Map<string, DailySummary>();

  for (const trade of trades) {
    const existing = map.get(trade.date);
    if (existing) {
      existing.totalPnl += trade.pnl;
      existing.tradeCount += 1;
      existing.trades.push(trade);
      if (trade.setup && !existing.tags.includes(trade.setup)) {
        existing.tags.push(trade.setup);
      }
    } else {
      map.set(trade.date, {
        date: trade.date,
        totalPnl: trade.pnl,
        tradeCount: 1,
        tags: trade.setup ? [trade.setup] : [],
        trades: [trade],
      });
    }
  }

  return map;
}

/** The month before, as a 0-based month: January 2026 → December 2025. */
export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

/** Whether any day of the month has a trade — the difference between "$0" and "nothing". */
export function monthHasTrades(summaries: Map<string, DailySummary>, year: number, month: number): boolean {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  for (const [key, summary] of summaries) {
    if (key.startsWith(prefix) && summary.tradeCount > 0) return true;
  }
  return false;
}

/**
 * The size of each week against the month's biggest, for the bar in the week-total column.
 *
 * Judged on absolute P&L, so a −$935 week draws as long a bar as a +$935 one: the bar says how
 * much happened, the colour says which way.
 */
export function weekShares(weeks: { summary: WeekSummary }[]): number[] {
  const max = Math.max(0, ...weeks.map((w) => Math.abs(w.summary.totalPnl)));
  return weeks.map((w) => (max > 0 && w.summary.tradeCount > 0 ? Math.abs(w.summary.totalPnl) / max : 0));
}

export function getMonthTotalPnl(summaries: Map<string, DailySummary>, year: number, month: number): number {
  let total = 0;
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  for (const [key, summary] of summaries) {
    if (key.startsWith(prefix)) {
      total += summary.totalPnl;
    }
  }
  return total;
}
