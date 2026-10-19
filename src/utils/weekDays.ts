import type { Trade } from '../types';
import { toDateKey } from './format';

export interface WeekDay {
  /** YYYY-MM-DD, in the trader's local calendar like every other date key here. */
  date: string;
  /** Mon, Tue… */
  label: string;
  net: number;
  trades: number;
}

/**
 * The last seven calendar days, oldest first, each with its net — the same window as
 * computeWeeklyRecap, so the bars and the figure above them describe the same week.
 *
 * Weekend days are dropped unless something was traded on them: two empty Saturday and Sunday
 * bars in every chart is a reminder that the market was shut, not information.
 */
export function weekDays(trades: readonly Trade[], now: Date): WeekDay[] {
  const days: WeekDay[] = [];
  const byDate = new Map<string, WeekDay>();
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    const day: WeekDay = {
      date: toDateKey(d),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      net: 0,
      trades: 0,
    };
    days.push(day);
    byDate.set(day.date, day);
  }
  for (const trade of trades) {
    const day = byDate.get(trade.date);
    if (day) {
      day.net += trade.pnl;
      day.trades += 1;
    }
  }
  return days.filter((day) => {
    const weekday = new Date(`${day.date}T12:00:00`).getDay();
    return day.trades > 0 || (weekday !== 0 && weekday !== 6);
  });
}
