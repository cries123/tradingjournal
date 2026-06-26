import type { DailySummary, Trade, WeekSummary } from '../types';
import { isExecutedTrade } from './tradeFilters';
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
    const pnlDelta = isExecutedTrade(trade) ? trade.pnl : 0;
    const isGhost = !isExecutedTrade(trade);

    if (existing) {
      existing.totalPnl += pnlDelta;
      existing.tradeCount += isExecutedTrade(trade) ? 1 : 0;
      if (isGhost) existing.ghostCount += 1;
      existing.trades.push(trade);
      if (trade.setup && !existing.tags.includes(trade.setup)) {
        existing.tags.push(trade.setup);
      }
      for (const tag of trade.marketContext ?? []) {
        if (!existing.tags.includes(tag)) existing.tags.push(tag);
      }
    } else {
      map.set(trade.date, {
        date: trade.date,
        totalPnl: pnlDelta,
        tradeCount: isExecutedTrade(trade) ? 1 : 0,
        ghostCount: isGhost ? 1 : 0,
        tags: [
          ...(trade.setup ? [trade.setup] : []),
          ...(trade.marketContext ?? []).filter((t) => t !== trade.setup),
        ],
        trades: [trade],
      });
    }
  }

  return map;
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
