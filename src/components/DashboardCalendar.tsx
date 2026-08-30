import { useMemo } from 'react';
import type { Trade } from '../types';
import { aggregateTradesByDay, buildCalendarWeeks, getMonthTotalPnl } from '../utils/calendar';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { useSettings } from '../context/SettingsContext';
import { DashboardDayCell } from './DashboardDayCell';
import { DashboardWeekTotalCell } from './DashboardWeekTotalCell';
import { MonthPicker } from './MonthPicker';

interface DashboardCalendarProps {
  year: number;
  month: number;
  trades: Trade[];
  onDayClick: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onMonthChange: (year: number, month: number) => void;
}

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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
}: DashboardCalendarProps) {
  const { settings } = useSettings();
  const summaries = useMemo(() => aggregateTradesByDay(trades), [trades]);
  const weeks = useMemo(() => buildCalendarWeeks(year, month, summaries), [year, month, summaries]);
  const monthTotal = useMemo(() => getMonthTotalPnl(summaries, year, month), [summaries, year, month]);

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

  return (
    <div className="panel-card p-2 md:p-4 shrink-0">
      <div className="flex flex-wrap items-center justify-between mb-1.5 md:mb-3 gap-x-2 gap-y-1">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">Calendar</p>
          <h2 className="text-xs md:text-lg font-semibold">{formatMonthYear(year, month)}</h2>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0 ml-auto">
          <span className={`text-[10px] md:text-sm font-semibold ${monthTotal >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {formatCurrency(monthTotal, settings.currency)}
          </span>
          <MonthPicker
            year={year}
            month={month}
            onPrev={onPrevMonth}
            onNext={onNextMonth}
            onChange={onMonthChange}
          />
        </div>
      </div>

      <div className="grid grid-cols-8 gap-0.5 md:gap-2 mb-0.5 md:mb-1">
        {WEEKDAYS.map((day, i) => (
          <div key={`${day}-${i}`} className="text-[8px] md:text-[11px] text-text-secondary text-center py-0.5 md:py-1 font-medium uppercase tracking-wide">
            <span className="md:hidden">{WEEKDAYS_SHORT[i]}</span>
            <span className="hidden md:inline">{day}</span>
          </div>
        ))}
        <div className="text-[8px] md:text-[11px] text-accent/80 text-center py-0.5 md:py-1 font-medium uppercase tracking-wide">
          <span className="md:hidden">Tot</span>
          <span className="hidden md:inline">Week total</span>
        </div>
      </div>

      <div key={`${year}-${month}`} className="grid grid-cols-8 gap-0.5 md:gap-2 animate-fade-up motion-safe:animate-fade-up">
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
                onClick={
                  day.date
                    ? () => onDayClick(`${year}-${String(month + 1).padStart(2, '0')}-${String(day.date!.getDate()).padStart(2, '0')}`)
                    : undefined
                }
              />
            )),
            <DashboardWeekTotalCell key={`week-total-${wi}`} summary={week.summary} compact={compact} />,
          ];
        })}
      </div>
    </div>
  );
}
