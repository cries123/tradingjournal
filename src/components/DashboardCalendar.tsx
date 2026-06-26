import { useMemo } from 'react';
import type { Trade } from '../types';
import { aggregateTradesByDay, buildCalendarWeeks, getMonthTotalPnl } from '../utils/calendar';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { useSettings } from '../context/SettingsContext';
import { DashboardDayCell } from './DashboardDayCell';
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

  return (
    <div className="panel-card p-2 md:p-4 shrink-0">
      <div className="flex flex-wrap items-center justify-between mb-1.5 md:mb-3 gap-x-2 gap-y-1">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-medium mb-0.5">Calendar</p>
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

      <div className="grid grid-cols-7 gap-0.5 md:gap-2 mb-0.5 md:mb-1">
        {WEEKDAYS.map((day, i) => (
          <div key={`${day}-${i}`} className="text-[8px] md:text-[11px] text-text-secondary text-center py-0.5 md:py-1 font-medium uppercase tracking-wide">
            <span className="md:hidden">{WEEKDAYS_SHORT[i]}</span>
            <span className="hidden md:inline">{day}</span>
          </div>
        ))}
      </div>

      <div key={`${year}-${month}`} className="grid grid-cols-7 gap-0.5 md:gap-2 animate-fade-up motion-safe:animate-fade-up">
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
