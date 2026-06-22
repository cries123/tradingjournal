import { Fragment, useMemo } from 'react';
import type { Trade } from '../types';
import { aggregateTradesByDay, buildCalendarWeeks, getMonthTotalPnl } from '../utils/calendar';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { DayCell } from './DayCell';
import { WeekSummaryCell } from './WeekSummaryCell';

interface CalendarViewProps {
  year: number;
  month: number;
  trades: Trade[];
  onDayClick: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({
  year,
  month,
  trades,
  onDayClick,
  onPrevMonth,
  onNextMonth,
}: CalendarViewProps) {
  const summaries = useMemo(() => aggregateTradesByDay(trades), [trades]);
  const weeks = useMemo(() => buildCalendarWeeks(year, month, summaries), [year, month, summaries]);
  const monthTotal = useMemo(() => getMonthTotalPnl(summaries, year, month), [summaries, year, month]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onPrevMonth}
            className="p-2 rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Previous month"
          >
            ‹
          </button>
          <h2 className="text-xl font-semibold">
            {formatMonthYear(year, month)}
            <span
              className={`ml-3 text-lg ${monthTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {formatCurrency(monthTotal)}
            </span>
          </h2>
          <button
            type="button"
            onClick={onNextMonth}
            className="p-2 rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-xs text-text-secondary text-center py-2 font-medium">
            {day}
          </div>
        ))}
        <div className="text-xs text-text-secondary text-center py-2 font-medium">Week</div>

        {weeks.map((week, wi) => (
          <Fragment key={wi}>
            {week.days.map((day, di) => (
              <DayCell
                key={`${wi}-${di}`}
                dayNumber={day.date?.getDate() ?? null}
                summary={day.summary}
                onClick={
                  day.date
                    ? () => onDayClick(`${year}-${String(month + 1).padStart(2, '0')}-${String(day.date!.getDate()).padStart(2, '0')}`)
                    : undefined
                }
              />
            ))}
            <WeekSummaryCell
              totalPnl={week.summary.totalPnl}
              tradeCount={week.summary.tradeCount}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
