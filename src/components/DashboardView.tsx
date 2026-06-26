import { useMemo, useState } from 'react';
import { Calendar, Grid3X3, Share2 } from 'lucide-react';
import type { Filters, Trade } from '../types';
import { useSettings } from '../context/SettingsContext';
import {
  computeStats,
  getCumulativePnlSeries,
  getDailyPnlForMonth,
  getMonthTrades,
  getWeekdayPnl,
  getWinRateSeries,
} from '../utils/stats';
import { AccountSwitcher } from './AccountSwitcher';
import { DailyPnlChart } from './DailyPnlChart';
import { DashboardCalendar } from './DashboardCalendar';
import { EmptyDashboard } from './EmptyDashboard';
import { FiltersBar } from './FiltersBar';
import { ShareMonthCard } from './ShareMonthCard';
import { StatsCards } from './StatsCards';
import { WeekdayChart } from './WeekdayChart';
import { YearHeatmap } from './YearHeatmap';

type DashboardMode = 'month' | 'year';

interface DashboardViewProps {
  trades: Trade[];
  hasAnyTrades: boolean;
  year: number;
  month: number;
  filters: Filters;
  filterSymbols: string[];
  filterSetups: string[];
  onFiltersChange: (filters: Filters) => void;
  onDayClick: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onMonthChange: (year: number, month: number) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
  onSelectMonth: (month: number) => void;
  onAddTrade: () => void;
  onImportCsv: () => void;
  onImportScreenshot: () => void;
}

export function DashboardView({
  trades,
  hasAnyTrades,
  year,
  month,
  filters,
  filterSymbols,
  filterSetups,
  onFiltersChange,
  onDayClick,
  onPrevMonth,
  onNextMonth,
  onMonthChange,
  onPrevYear,
  onNextYear,
  onSelectMonth,
  onAddTrade,
  onImportCsv,
  onImportScreenshot,
}: DashboardViewProps) {
  const { settings } = useSettings();
  const [mode, setMode] = useState<DashboardMode>('month');
  const [showShare, setShowShare] = useState(false);

  const monthTrades = useMemo(() => getMonthTrades(trades, year, month), [trades, year, month]);
  const stats = useMemo(() => computeStats(monthTrades), [monthTrades]);
  const dailyPnl = useMemo(() => getDailyPnlForMonth(trades, year, month), [trades, year, month]);
  const weekdayPnl = useMemo(() => getWeekdayPnl(trades, year, month), [trades, year, month]);
  const cumulativeSeries = useMemo(() => getCumulativePnlSeries(trades, year, month), [trades, year, month]);
  const winRateSeries = useMemo(() => getWinRateSeries(trades, year, month), [trades, year, month]);

  const activeJournal = settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'Journal';
  const hasFilters = Boolean(filters.symbol || filters.setup || filters.side);

  return (
    <div className="h-full flex flex-col gap-2 md:gap-3 min-h-0 overflow-y-auto md:overflow-hidden">
      <AccountSwitcher />

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex rounded-lg bg-bg-tertiary/60 p-0.5 border border-border/50">
          <button
            type="button"
            onClick={() => setMode('month')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-ring ${
              mode === 'month' ? 'bg-emerald-500/15 text-emerald-300' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Calendar size={14} />
            Month
          </button>
          <button
            type="button"
            onClick={() => setMode('year')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-ring ${
              mode === 'year' ? 'bg-emerald-500/15 text-emerald-300' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Grid3X3 size={14} />
            Year
          </button>
        </div>

        {mode === 'month' && monthTrades.length > 0 && (
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 text-text-secondary hover:text-text-primary hover:border-emerald-500/30 transition-colors focus-ring"
          >
            <Share2 size={14} />
            Share month
          </button>
        )}
      </div>

      {!hasAnyTrades && (
        <EmptyDashboard onAddTrade={onAddTrade} onImportCsv={onImportCsv} onImportScreenshot={onImportScreenshot} />
      )}

      {mode === 'month' ? (
        <DashboardCalendar
          year={year}
          month={month}
          trades={trades}
          onDayClick={onDayClick}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          onMonthChange={onMonthChange}
        />
      ) : (
        <YearHeatmap
          trades={trades}
          year={year}
          onPrevYear={onPrevYear}
          onNextYear={onNextYear}
          onSelectMonth={(m) => {
            onSelectMonth(m);
            setMode('month');
          }}
        />
      )}

      {(hasAnyTrades || hasFilters) && (
        <FiltersBar filters={filters} symbols={filterSymbols} setups={filterSetups} onChange={onFiltersChange} />
      )}

      <StatsCards stats={stats} cumulativeSeries={cumulativeSeries} winRateSeries={winRateSeries} />

      {hasAnyTrades && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 md:flex-1 md:min-h-[180px] pb-2 md:pb-0">
          <div className="panel-card p-2.5 md:p-4 flex flex-col min-h-[120px] md:min-h-0 md:overflow-hidden">
            <h3 className="text-[10px] md:text-sm font-semibold mb-1.5 md:mb-3 shrink-0 text-text-primary">
              Performance by Weekday
            </h3>
            <div className="flex-1 min-h-[80px] md:min-h-0">
              <WeekdayChart data={weekdayPnl} />
            </div>
          </div>
          <div className="panel-card p-2.5 md:p-4 flex flex-col min-h-[140px] md:min-h-0 md:overflow-hidden">
            <div className="flex items-center justify-between mb-1.5 md:mb-3 shrink-0 gap-2">
              <h3 className="text-[10px] md:text-sm font-semibold whitespace-nowrap text-text-primary">Gross Daily P&L</h3>
              <div className="flex gap-2 text-[9px] md:text-[10px] shrink-0">
                <span className="flex items-center gap-1 text-profit-bright">
                  <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-sm bg-profit-bright" /> Win
                </span>
                <span className="flex items-center gap-1 text-loss-bright">
                  <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-sm bg-loss-bright" /> Loss
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-[80px] md:min-h-0">
              <DailyPnlChart data={dailyPnl} />
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <ShareMonthCard
          stats={stats}
          year={year}
          month={month}
          journalName={activeJournal}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
