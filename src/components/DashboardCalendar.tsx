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
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{formatMonthYear(year, month)}</h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${monthTotal >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {formatCurrency(monthTotal)}
          </span>
          <div className="flex gap-1">
            <button type="button" onClick={onPrevMonth} className="p-1.5 rounded hover:bg-bg-tertiary text-text-secondary" aria-label="Previous month">‹</button>
            <button type="button" onClick={onNextMonth} className="p-1.5 rounded hover:bg-bg-tertiary text-text-secondary" aria-label="Next month">›</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-[11px] text-text-secondary text-center py-1 font-medium uppercase tracking-wide">
            {day}
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
