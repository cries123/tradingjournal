import { useMemo } from 'react';
import type { Trade } from '../types';
import {
  computeStats,
  getDailyPnlForMonth,
  getMonthTrades,
  getWeekdayPnl,
} from '../utils/stats';
import { DailyPnlChart } from './DailyPnlChart';
import { DashboardCalendar } from './DashboardCalendar';
import { StatsCards } from './StatsCards';
import { WeekdayChart } from './WeekdayChart';

interface DashboardViewProps {
  trades: Trade[];
  year: number;
  month: number;
  onDayClick: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function DashboardView({
  trades,
  year,
  month,
  onDayClick,
  onPrevMonth,
  onNextMonth,
}: DashboardViewProps) {
  const monthTrades = useMemo(() => getMonthTrades(trades, year, month), [trades, year, month]);
  const stats = useMemo(() => computeStats(monthTrades), [monthTrades]);
  const dailyPnl = useMemo(() => getDailyPnlForMonth(trades, year, month), [trades, year, month]);
  const weekdayPnl = useMemo(() => getWeekdayPnl(trades, year, month), [trades, year, month]);

  return (
    <div className="h-full flex flex-col gap-2 min-h-0 md:overflow-hidden">
      <DashboardCalendar
        year={year}
        month={month}
        trades={trades}
        onDayClick={onDayClick}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
      />

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:flex-1 md:min-h-0 pb-2 md:pb-0">
        <div className="bg-bg-card border border-border rounded-lg p-2.5 md:p-3 flex flex-col min-h-[120px] md:min-h-0">
          <h3 className="text-[10px] md:text-xs font-semibold mb-1.5 md:mb-2 shrink-0">Performance by Weekday</h3>
          <div className="flex-1 min-h-0">
            <WeekdayChart data={weekdayPnl} />
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-2.5 md:p-3 flex flex-col min-h-[140px] md:min-h-0">
          <div className="flex items-center justify-between mb-1.5 md:mb-2 shrink-0">
            <h3 className="text-[10px] md:text-xs font-semibold">Gross Daily P&L</h3>
            <div className="flex gap-2 text-[9px] md:text-[10px]">
              <span className="flex items-center gap-1 text-profit-bright">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-sm bg-profit-bright" /> Win
              </span>
              <span className="flex items-center gap-1 text-loss-bright">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-sm bg-loss-bright" /> Loss
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <DailyPnlChart data={dailyPnl} />
          </div>
        </div>
      </div>
    </div>
  );
}
