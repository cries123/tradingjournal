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
    <div className="space-y-4">
      <DashboardCalendar
        year={year}
        month={month}
        trades={trades}
        onDayClick={onDayClick}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
      />

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Performance by Weekday</h3>
          <WeekdayChart data={weekdayPnl} />
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Gross Daily P&L</h3>
            <div className="flex gap-2 text-[10px]">
              <span className="flex items-center gap-1 text-profit-bright">
                <span className="w-2 h-2 rounded-sm bg-profit-bright" /> Win
              </span>
              <span className="flex items-center gap-1 text-loss-bright">
                <span className="w-2 h-2 rounded-sm bg-loss-bright" /> Loss
              </span>
            </div>
          </div>
          <DailyPnlChart data={dailyPnl} />
        </div>
      </div>
    </div>
  );
}
