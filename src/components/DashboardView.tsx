import { useMemo, useState } from 'react';
import { Calendar, Grid3X3, RefreshCw } from 'lucide-react';
import type { Filters, Trade } from '../types';
import { computeStats, getMonthTrades, getYearTrades } from '../utils/stats';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { computeJournalingStreak, computeTradingInsights } from '../utils/insights';
import { computeTakeaway } from '../utils/takeaway';
import { useSettings } from '../context/useSettings';
import { AccountSwitcher } from './AccountSwitcher';
import { useAiTakeaway } from '../hooks/useAiTakeaway';
import { SiteAnnouncement } from './SiteAnnouncement';
import { DuplicateTradesBanner } from './DuplicateTradesBanner';
import { WeeklyRecapCard } from './WeeklyRecapCard';
import { DashboardCalendar } from './DashboardCalendar';
import { EmptyDashboard } from './EmptyDashboard';
import { FiltersBar } from './FiltersBar';
import { StatsCards } from './StatsCards';
import { YearMonths } from './YearMonths';
import { TradingInsightsSection } from './analytics/TradingInsightsSection';
import { DirectionPanel } from './analytics/DirectionPanel';
import { TakeawayBanner } from './analytics/TakeawayBanner';

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
  onConnectBroker: () => void;
  sampleActive?: boolean;
  onLoadSample?: () => void;
  onClearSample?: () => void;
  /** Every trade in every journal — duplicates shouldn't hide in a journal you aren't on. */
  everyTrade?: Trade[];
  onRemoveTrades?: (ids: string[]) => Promise<void>;
  /** Sends the trader to the broker screen, where syncing is done by hand. */
  onSyncBroker?: () => void;
  /** True once a broker is linked — the sync shortcut is noise for everyone else. */
  hasBrokerTrades?: boolean;
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
  onConnectBroker,
  sampleActive = false,
  onLoadSample,
  onClearSample,
  everyTrade,
  onRemoveTrades,
  onSyncBroker,
  hasBrokerTrades = false,
}: DashboardViewProps) {
  const { settings } = useSettings();
  const [mode, setMode] = useState<DashboardMode>('month');

  const monthTrades = useMemo(() => getMonthTrades(trades, year, month), [trades, year, month]);
  const yearTrades = useMemo(() => getYearTrades(trades, year), [trades, year]);
  const stats = useMemo(() => computeStats(monthTrades), [monthTrades]);
  const yearStats = useMemo(() => computeStats(yearTrades), [yearTrades]);
  const hasFilters = Boolean(filters.symbol || filters.setup || filters.side || filters.tag);
  const analyticsTrades = mode === 'month' ? monthTrades : yearTrades;
  const streakDays = useMemo(() => computeJournalingStreak(trades), [trades]);

  const takeaway = useMemo(() => {
    const insights = computeTradingInsights(analyticsTrades);
    if (!insights) return null;
    return computeTakeaway({
      trades: analyticsTrades,
      insights,
      currencyFormat: (n) => formatCurrency(n, settings.currency),
    });
  }, [analyticsTrades, settings.currency]);

  /*
   * The AI read of the same period, which replaces the computed text above once it arrives.
   *
   * The period key is what the server caches on, so it has to identify the period and nothing else
   * — a month is "2026-07", a year is "2026". Deliberately not the display label: "July 2026" would
   * mint a second cache entry the moment anything about formatting or locale changed.
   */
  const periodKey = mode === 'month' ? `${year}-${String(month + 1).padStart(2, '0')}` : String(year);
  const { text: aiTakeawayText, pending: aiTakeawayPending } = useAiTakeaway(
    analyticsTrades,
    periodKey,
    settings.tradingRules,
  );

  return (
    <div className="flex flex-col gap-2 md:gap-3 pb-2">
      {/* Above everything else: if the numbers below are inflated by a double import, that's the
          first thing the trader needs to know — before they read a single stat. */}
      {everyTrade && onRemoveTrades && (
        <DuplicateTradesBanner trades={everyTrade} onRemove={onRemoveTrades} />
      )}

      <SiteAnnouncement onConnectBroker={onConnectBroker} />

      {/* Phone only. On desktop the sidebar already carries the journal switcher, and rendering
          both put the same control on screen twice, a few hundred pixels apart. */}
      <div className="md:hidden">
        <AccountSwitcher />
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex rounded-lg bg-bg-tertiary/60 p-0.5 border border-border/50">
          <button
            type="button"
            onClick={() => setMode('month')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-ring ${
              mode === 'month' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Calendar size={14} />
            Month
          </button>
          <button
            type="button"
            onClick={() => setMode('year')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-ring ${
              mode === 'year' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Grid3X3 size={14} />
            Year
          </button>
        </div>

        {/* Syncing is something you do, not something that happens to you: the broker is only ever
            contacted when the trader presses Sync on the Connect Broker screen. So this is a plain
            shortcut to that screen, not a status line about a background job — there is no
            background job. */}
        {hasBrokerTrades && onSyncBroker && (
          <button
            type="button"
            onClick={onSyncBroker}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-accent transition-colors focus-ring rounded shrink-0"
          >
            <RefreshCw size={11} />
            Sync broker
          </button>
        )}
      </div>

      {!hasAnyTrades && (
        <EmptyDashboard
          onAddTrade={onAddTrade}
          onConnectBroker={onConnectBroker}
          onLoadSample={onLoadSample}
        />
      )}

      {sampleActive && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 shrink-0">
          <p className="text-xs text-amber-300">
            You're viewing example data — it disappears when you add your own trades or refresh.
          </p>
          {onClearSample && (
            <button
              type="button"
              onClick={onClearSample}
              className="text-xs font-medium text-amber-300 hover:text-amber-200 underline focus-ring rounded"
            >
              Clear examples
            </button>
          )}
        </div>
      )}

      {hasAnyTrades && (
        <StatsCards
          stats={mode === 'month' ? stats : yearStats}
          periodLabel={mode === 'month' ? formatMonthYear(year, month) : String(year)}
          streakDays={streakDays}
          goalPnl={mode === 'month' ? settings.monthlyGoalPnl : 0}
          showBenchmark={mode === 'month'}
        />
      )}

      {hasAnyTrades && <TakeawayBanner takeaway={takeaway} aiText={aiTakeawayText} aiPending={aiTakeawayPending} />}

      {/* Calendar beside its context, not above it.
          Stacked, the equity curve and the week recap pushed the calendar most of a screen down
          and left ~540px of empty gutter either side of everything. Side by side they occupy space
          that was already being paid for, and the page loses roughly a screen of scrolling.
          The breakpoint is 1800px, not xl. The calendar needs about 950px before its day cells
          start truncating dollar amounts — at 1280 the split left it 620px and "$162.00" became
          "$162…", which is worse than scrolling. Below that it stays full width. */}
      <div className="grid gap-2 md:gap-3 ultra:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] ultra:items-start">
        <div className="min-w-0 ultra:order-1">
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
          <YearMonths
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
        </div>

        <div className="flex flex-col gap-2 md:gap-3 min-w-0 ultra:order-2">
          {hasAnyTrades && <WeeklyRecapCard trades={trades} />}
        </div>
      </div>

      {(hasAnyTrades || hasFilters) && (
        <FiltersBar filters={filters} symbols={filterSymbols} setups={filterSetups} onChange={onFiltersChange} />
      )}

      {/* Direction on its own row now that Gross Daily P&L, which was the other half of it, has
          gone with the rest of the charts. Full width rather than a half-width card stranded
          beside an empty column. */}
      {hasAnyTrades && (
        <div className="panel-card p-3 md:p-4 flex flex-col min-h-[160px]">
          <div className="mb-1.5 md:mb-3 shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
              Direction
            </p>
            <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">Long vs Short</h3>
          </div>
          <div className="flex-1 min-h-[80px]">
            <DirectionPanel trades={analyticsTrades} currency={settings.currency} />
          </div>
        </div>
      )}

      {hasAnyTrades && <TradingInsightsSection trades={analyticsTrades} />}

    </div>
  );
}
