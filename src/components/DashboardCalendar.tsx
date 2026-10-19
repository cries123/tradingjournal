import { useMemo, useState } from 'react';
import type { Trade } from '../types';
import {
  aggregateTradesByDay,
  buildCalendarWeeks,
  getMonthTotalPnl,
  monthHasTrades,
  previousMonth,
  weekShares,
} from '../utils/calendar';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { useSettings } from '../context/useSettings';
import { DashboardDayCell } from './DashboardDayCell';
import { DashboardWeekTotalCell } from './DashboardWeekTotalCell';
import { MonthPicker } from './MonthPicker';
import { CountUp } from './motion/CountUp';
import { filledDays, nextDaySeen, type DaySeen } from '../utils/freshDays';

interface DashboardCalendarProps {
  year: number;
  month: number;
  trades: Trade[];
  onDayClick: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onMonthChange: (year: number, month: number) => void;
  /** Days on which one of the trader's rules was broken — marked on the grid. */
  ruleDates?: ReadonlySet<string>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/**
 * All seven days are shown.
 *
 * Saturday used to be dropped as "almost never a trading day", but the week total is summed over
 * the full seven — so a Saturday trade counted toward the week and month totals while having no
 * cell to appear in, and the numbers on screen didn't add up to the ones beside them. A calendar
 * that can hide a trade is worse than one with a mostly-quiet column.
 */
const DAYS_PER_WEEK = 7;

const NO_DATES: ReadonlySet<string> = new Set();

/** "2026-07-04" for a day of a 0-based month — the key trades and summaries are filed under. */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True when one of this week's cells is today — that row stays full height even when empty,
 *  since it's the one the trader is most likely to click into to log a session. */
function weekHasToday(week: { days: { date: Date | null }[] }, today: Date): boolean {
  return week.days.some((d) => d.date?.getDate() === today.getDate());
}

export function DashboardCalendar({
  year,
  month,
  trades,
  onDayClick,
  onPrevMonth,
  onNextMonth,
  onMonthChange,
  ruleDates = NO_DATES,
}: DashboardCalendarProps) {
  const { settings } = useSettings();
  const summaries = useMemo(() => aggregateTradesByDay(trades), [trades]);
  const weeks = useMemo(() => buildCalendarWeeks(year, month, summaries), [year, month, summaries]);
  const monthTotal = useMemo(() => getMonthTotalPnl(summaries, year, month), [summaries, year, month]);
  const shares = useMemo(() => weekShares(weeks), [weeks]);

  /*
   * Last month beside this one. The total on its own says how the month went; against the month
   * before it says whether things are getting better. Only when there was a last month to compare
   * with — "vs $0.00" for a trader who started this month is not a comparison.
   */
  const prior = useMemo(() => {
    const p = previousMonth(year, month);
    return monthHasTrades(summaries, p.year, p.month) ? getMonthTotalPnl(summaries, p.year, p.month) : null;
  }, [summaries, year, month]);

  /*
   * Days that just gained their first trade while this month is on screen pop into the grid — the
   * moment a sync lands, which is the moment this product exists for. Derived during render from
   * the previous record (React's "store information from previous renders" pattern) rather than in
   * an effect, so the pop starts on the same frame as the day's figure rather than one after it.
   */
  const monthKey = `${year}-${month}`;
  const days = useMemo(() => filledDays(summaries, year, month), [summaries, year, month]);
  const [seen, setSeen] = useState<DaySeen>(() => nextDaySeen(null, monthKey, days));
  const nextSeen = nextDaySeen(seen, monthKey, days);
  if (nextSeen !== seen) setSeen(nextSeen);
  const fresh = nextSeen.fresh;

  const maxDayAbs = useMemo(() => {
    let max = 0;
    for (const week of weeks) {
      for (const day of week.days.slice(0, DAYS_PER_WEEK)) {
        if (day.summary && day.summary.tradeCount > 0) {
          max = Math.max(max, Math.abs(day.summary.totalPnl));
        }
      }
    }
    return max;
  }, [weeks]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  return (
    <div className="panel-card p-2 md:p-4 shrink-0">
      <div className="flex flex-wrap items-center justify-between mb-1.5 md:mb-3 gap-x-2 gap-y-1">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">Calendar</p>
          {/* Keyed on the month so it fades in with the grid below, instead of the grid fading
              in under a heading that had already changed. */}
          <h2 key={monthKey} className="text-xs md:text-lg font-semibold animate-page-in">{formatMonthYear(year, month)}</h2>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0 ml-auto">
          <span className="text-right leading-tight">
            {/* Rolls from last month's total to this one's while the grid fades in. */}
            <span className={`block text-[10px] md:text-sm font-semibold tabular-nums ${monthTotal >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
              <CountUp value={monthTotal} format={fmt} />
            </span>
            {prior !== null && (
              <span className="hidden sm:block text-[10px] md:text-[11px] text-text-secondary tabular-nums">
                vs <span className={prior >= 0 ? 'text-profit-bright/80' : 'text-loss-bright/80'}>{fmt(prior)}</span> last month
              </span>
            )}
          </span>
          {/* From md up only: a phone steps the period in the Overview's toolbar, which every tab
              shares, and a second picker two inches below it was the same control twice. */}
          <div className="hidden md:block">
            <MonthPicker
              year={year}
              month={month}
              onPrev={onPrevMonth}
              onNext={onNextMonth}
              onChange={onMonthChange}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-2 mb-1">
        {WEEKDAYS.map((day, i) => (
          <div key={`${day}-${i}`} className="text-[11px] text-text-secondary text-center py-1 font-medium uppercase tracking-wide">
            {day}
          </div>
        ))}
        <div className="text-[11px] text-accent/80 text-center py-1 font-medium uppercase tracking-wide">
          Week total
        </div>
      </div>

      <div key={`${year}-${month}`} className="grid grid-cols-8 gap-2 animate-fade-up motion-safe:animate-fade-up">
        {weeks.flatMap((week, wi) => {
          // Weeks with nothing in them collapse to a slim row. A month that begins on a Friday
          // otherwise opens with two full-height rows of empty cells, which pushed the actual
          // trading days below the fold for no information gain. The row stays visible (rather
          // than being dropped) so the month's shape and the date alignment still read correctly.
          const compact = week.summary.tradeCount === 0 && !(isCurrentMonth && weekHasToday(week, today));

          return [
            ...week.days.slice(0, DAYS_PER_WEEK).map((day, di) => (
              <DashboardDayCell
                key={day.date?.toISOString() ?? `e-${wi}-${di}`}
                dayNumber={day.date?.getDate() ?? null}
                summary={day.summary}
                compact={compact}
                intensity={
                  day.summary && day.summary.tradeCount > 0 && maxDayAbs > 0
                    ? Math.abs(day.summary.totalPnl) / maxDayAbs
                    : 0
                }
                isToday={isCurrentMonth && day.date?.getDate() === today.getDate()}
                fresh={day.date ? fresh.has(dayKey(year, month, day.date.getDate())) : false}
                ruleBroken={day.date ? ruleDates.has(dayKey(year, month, day.date.getDate())) : false}
                onClick={
                  day.date
                    ? () => onDayClick(dayKey(year, month, day.date!.getDate()))
                    : undefined
                }
              />
            )),
            <DashboardWeekTotalCell key={`week-total-${wi}`} summary={week.summary} compact={compact} share={shares[wi]} />,
          ];
        })}
      </div>
    </div>
  );
}
