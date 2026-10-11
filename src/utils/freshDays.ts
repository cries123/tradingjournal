import type { DailySummary } from '../types';

/** The days of one month that have at least one trade, as YYYY-MM-DD keys. */
export function filledDays(summaries: Map<string, DailySummary>, year: number, month: number): Set<string> {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const out = new Set<string>();
  for (const [key, summary] of summaries) {
    if (key.startsWith(prefix) && summary.tradeCount > 0) out.add(key);
  }
  return out;
}

/**
 * The calendar's record of which days it has already shown filled, and which just arrived.
 *
 * A day "arrives" when it gains its first trade while the same month is on screen — a sync landing,
 * a CSV import, a trade logged by hand — and those days pop into the grid. Opening the dashboard, or
 * moving to another month, is not an arrival: every day of that month would otherwise pop at once,
 * which is noise rather than news. So a change of month starts a fresh record with nothing fresh in
 * it, and only a change of trades within the month produces fresh days.
 *
 * A day that already had trades and gets another is not fresh either; it was already on the grid.
 */
export interface DaySeen {
  monthKey: string;
  days: Set<string>;
  fresh: Set<string>;
}

export function nextDaySeen(previous: DaySeen | null, monthKey: string, days: Set<string>): DaySeen {
  if (!previous || previous.monthKey !== monthKey) return { monthKey, days, fresh: new Set() };
  if (previous.days === days) return previous;
  const fresh = new Set<string>();
  for (const day of days) if (!previous.days.has(day)) fresh.add(day);
  return { monthKey, days, fresh };
}
