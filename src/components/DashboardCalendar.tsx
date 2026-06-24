import { useMemo } from 'react';
import type { Trade } from '../types';
import { aggregateTradesByDay, buildCalendarWeeks, getMonthTotalPnl } from '../utils/calendar';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { DashboardDayCell } from './DashboardDayCell';

interface DashboardCalendarProps {
  year: number;
  month: number;
  trades: Trade[];
  onDayClick: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DashboardCalendar({
  year,
  month,
  trades,
  onDayClick,
  onPrevMonth,
  onNextMonth,
}: DashboardCalendarProps) {
  const summaries = useMemo(() => aggregateTradesByDay(trades), [trades]);
  const weeks = useMemo(() => buildCalendarWeeks(year, month, summaries), [year, month, summaries]);
  const monthTotal = useMemo(() => getMonthTotalPnl(summaries, year, month), [summaries, year, month]);

  return (
    <div className="bg-bg-card border border-border rounded-lg p-2 md:p-3 shrink-0">
      <div className="flex items-center justify-between mb-1.5 md:mb-2">
        <h2 className="text-xs md:text-sm font-semibold">{formatMonthYear(year, month)}</h2>
        <div className="flex items-center gap-1.5 md:gap-2">
          <span className={`text-[10px] md:text-xs font-semibold ${monthTotal >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {formatCurrency(monthTotal)}
          </span>
          <div className="flex gap-0.5">
            <button type="button" onClick={onPrevMonth} className="p-1 rounded hover:bg-bg-tertiary text-text-secondary text-sm" aria-label="Previous month">‹</button>
            <button type="button" onClick={onNextMonth} className="p-1 rounded hover:bg-bg-tertiary text-text-secondary text-sm" aria-label="Next month">›</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 md:gap-1">
        {WEEKDAYS.map((day, i) => (
          <div key={day} className="text-[8px] md:text-[9px] text-text-secondary text-center py-0.5 font-medium uppercase tracking-wide">
            <span className="md:hidden">{WEEKDAYS_SHORT[i]}</span>
            <span className="hidden md:inline">{day}</span>
          </div>
        ))}
        {weeks.flatMap((week) =>
          week.days.map((day, di) => (
            <DashboardDayCell
              key={`${day.date?.toISOString() ?? 'e'}-${di}`}
              dayNumber={day.date?.getDate() ?? null}
              summary={day.summary}
              onClick={
                day.date
                  ? () => onDayClick(`${year}-${String(month + 1).padStart(2, '0')}-${String(day.date!.getDate()).padStart(2, '0')}`)
                  : undefined
              }
            />
          )),
        )}
      </div>
    </div>
  );
}
