import { useMemo, useState } from 'react';
import { Calendar, Grid3X3, Info, RefreshCw, Share2 } from 'lucide-react';
import type { Filters, Trade } from '../types';
import {
  computeStats,
  getCumulativePnlSeries,
  getDailyPnlForMonth,
  getEquityCurve,
  getMonthTrades,
  getWeekdayPnl,
  getWinRateSeries,
  getYearTrades,
} from '../utils/stats';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { computeJournalingStreak, computeTradingInsights } from '../utils/insights';
import {
  computeExcursionInsights,
  computeRMultipleInsights,
  computeSessionPerformance,
  sessionPhrase,
} from '../utils/tradeQuality';
import { computeTakeaway } from '../utils/takeaway';
import { useSettings } from '../context/SettingsContext';
import { AccountSwitcher } from './AccountSwitcher';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { SiteAnnouncement } from './SiteAnnouncement';
import { DuplicateTradesBanner } from './DuplicateTradesBanner';
import { WeeklyRecapCard } from './WeeklyRecapCard';
import { DailyPnlChart } from './DailyPnlChart';
import { DashboardCalendar } from './DashboardCalendar';
import { EmptyDashboard } from './EmptyDashboard';
import { FiltersBar } from './FiltersBar';
import { ShareCardModal } from './ShareCardModal';
import { StatsCards } from './StatsCards';
import { WeekdayChart } from './WeekdayChart';
import { YearHeatmap } from './YearHeatmap';
import { TradingInsightsSection } from './analytics/TradingInsightsSection';
import { EquityCurve } from './analytics/EquityCurve';
import { ExecutionPanel } from './analytics/ExecutionPanel';
import { SessionChart } from './analytics/SessionChart';
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
  const [showShare, setShowShare] = useState(false);
  const isCompact = useMediaQuery('(max-width: 767px)');

  const monthTrades = useMemo(() => getMonthTrades(trades, year, month), [trades, year, month]);
  const yearTrades = useMemo(() => getYearTrades(trades, year), [trades, year]);
  const stats = useMemo(() => computeStats(monthTrades), [monthTrades]);
  const yearStats = useMemo(() => computeStats(yearTrades), [yearTrades]);
  const dailyPnl = useMemo(() => getDailyPnlForMonth(trades, year, month), [trades, year, month]);
  const weekdayPnl = useMemo(() => getWeekdayPnl(trades, year, month), [trades, year, month]);
  const cumulativeSeries = useMemo(() => getCumulativePnlSeries(trades, year, month), [trades, year, month]);
  const winRateSeries = useMemo(() => getWinRateSeries(trades, year, month), [trades, year, month]);

  const hasFilters = Boolean(filters.symbol || filters.setup || filters.side || filters.tag);
  const analyticsTrades = mode === 'month' ? monthTrades : yearTrades;
  const streakDays = useMemo(() => computeJournalingStreak(trades), [trades]);

  const equityPoints = useMemo(() => getEquityCurve(analyticsTrades), [analyticsTrades]);
  const sessions = useMemo(() => computeSessionPerformance(analyticsTrades), [analyticsTrades]);
  const excursion = useMemo(() => computeExcursionInsights(analyticsTrades), [analyticsTrades]);
  const rMultiple = useMemo(() => computeRMultipleInsights(analyticsTrades), [analyticsTrades]);

  /*
   * How many analytics panels will actually render.
   *
   * Days always does. Timing needs entry times on the trades and Execution needs MAE/MFE or risk
   * data — neither of which arrives from a broker sync, so a journal filled entirely from Schwab
   * or Robinhood renders exactly one of the three. The grid below declared three columns
   * regardless, leaving the Days card alone in a third of the row: 1107px of a 1649px row empty,
   * measured in the browser rather than guessed at.
   */
  const hasExecution = Boolean(excursion || rMultiple);
  const analyticsPanels = 1 + (sessions ? 1 : 0) + (hasExecution ? 1 : 0);

  // One plain-language read of the timing chart, so the panel answers "so what" rather than
  // leaving the trader to compare bar lengths themselves.
  const sessionSummary = useMemo(() => {
    if (!sessions || sessions.length < 2) return null;
    const sorted = [...sessions].sort((a, b) => b.pnl - a.pnl);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.pnl <= 0) return null;

    const money = (n: number) => formatCurrency(Math.abs(n), settings.currency);
    if (worst.pnl < 0) {
      return `Your best window is ${sessionPhrase(best.session)} (${money(best.pnl)} across ${best.trades} trades). ${
        sessionPhrase(worst.session).charAt(0).toUpperCase() + sessionPhrase(worst.session).slice(1)
      } gives back ${money(worst.pnl)}.`;
    }
    return `Your best window is ${sessionPhrase(best.session)} — ${money(best.pnl)} across ${best.trades} trades at a ${best.winRate.toFixed(0)}% win rate.`;
  }, [sessions, settings.currency]);

  const takeaway = useMemo(() => {
    const insights = computeTradingInsights(analyticsTrades);
    if (!insights) return null;
    return computeTakeaway({
      trades: analyticsTrades,
      insights,
      currencyFormat: (n) => formatCurrency(n, settings.currency),
    });
  }, [analyticsTrades, settings.currency]);

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

        {/* Syncing is something you do, not something that happens to you — so the affordance is a
            plain shortcut to the broker screen rather than a status line about a background job. */}
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

        {(mode === 'month' ? monthTrades.length > 0 : yearTrades.length > 0) && (
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className={`${hasBrokerTrades && onSyncBroker ? '' : 'ml-auto '}flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors focus-ring`}
          >
            <Share2 size={14} />
            {mode === 'month' ? 'Share month' : 'Share year'}
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
          cumulativeSeries={mode === 'month' ? cumulativeSeries : []}
          winRateSeries={mode === 'month' ? winRateSeries : []}
          periodLabel={mode === 'month' ? formatMonthYear(year, month) : String(year)}
          streakDays={streakDays}
          goalPnl={mode === 'month' ? settings.monthlyGoalPnl : 0}
          showBenchmark={mode === 'month'}
        />
      )}

      {hasAnyTrades && <TakeawayBanner takeaway={takeaway} />}

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
        </div>

        <div className="flex flex-col gap-2 md:gap-3 min-w-0 ultra:order-2">
          {hasAnyTrades && equityPoints.length >= 2 && (
          <div className="panel-card p-3 md:p-4">
            <div className="flex items-start justify-between gap-2 mb-1 md:mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
                  Equity
                </p>
                <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">
                  Cumulative P&amp;L {mode === 'month' ? formatMonthYear(year, month) : year}
                </h3>
              </div>
              <span className="text-[9px] md:text-[10px] text-text-secondary shrink-0 pt-0.5 hidden sm:block">
                Shaded area = drawdown from your running high
              </span>
            </div>
            {/* 200px was over half a phone screen for one line. */}
            <EquityCurve points={equityPoints} height={isCompact ? 120 : 170} />
          </div>
          )}

          {hasAnyTrades && <WeeklyRecapCard trades={trades} />}

          {/* Weekday sits here rather than in the row below because it is a short list of bars in
              a tall card — exactly the shape that fills the space the calendar leaves beside it,
              and exactly the shape that looked stretched at full width. */}
          {hasAnyTrades && (
            <div className="panel-card p-3 md:p-4 flex flex-col flex-1 min-h-[140px]">
              <div className="mb-1.5 md:mb-3 shrink-0">
                <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
                  Rhythm
                </p>
                <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">
                  Performance by Weekday
                </h3>
              </div>
              <div className="flex-1 min-h-[80px]">
                <WeekdayChart data={weekdayPnl} />
              </div>
            </div>
          )}
        </div>
      </div>

      {(hasAnyTrades || hasFilters) && (
        <FiltersBar filters={filters} symbols={filterSymbols} setups={filterSetups} onChange={onFiltersChange} />
      )}

      {/* Days, Timing and Execution across one row instead of a 2x2 block, once there is room for
          three without crowding — Execution carries two lines of prose per row and needs ~480px
          before it starts stacking into a column of fragments.

          The column count follows how many panels will actually render, rather than assuming all
          three always do. Two panels sit in two columns; only the full set earns a third. */}
      {hasAnyTrades && (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 ${
            analyticsPanels === 3 ? 'wide:grid-cols-3!' : ''
          }`}
        >
          <div className="panel-card p-3 md:p-4 flex flex-col min-h-[160px]">
            <div className="flex items-start justify-between mb-1.5 md:mb-3 shrink-0 gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
                  Days
                </p>
                <h3 className="text-[10px] md:text-sm font-semibold whitespace-nowrap text-text-primary">Gross Daily P&L</h3>
              </div>
              <div className="flex gap-2 text-[9px] md:text-[10px] shrink-0 pt-0.5">
                <span className="flex items-center gap-1 text-profit-bright">
                  <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-sm bg-profit-bright" /> Win
                </span>
                <span className="flex items-center gap-1 text-loss-bright">
                  <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-sm bg-loss-bright" /> Loss
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-[80px]">
              <DailyPnlChart data={dailyPnl} />
            </div>
          </div>

          {sessions && (
            <div className="panel-card p-3 md:p-4 flex flex-col min-h-[140px]">
              <div className="mb-1.5 md:mb-3 shrink-0">
                <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
                  Timing
                </p>
                <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">
                  Performance by Time of Day
                </h3>
              </div>
              <div className="flex-1 min-h-[80px]">
                <SessionChart data={sessions} />
              </div>
              {sessionSummary && (
                <p className="text-[10px] md:text-[11px] text-text-secondary mt-2 leading-snug shrink-0">
                  {sessionSummary}
                </p>
              )}
            </div>
          )}
          {/* At md the three panels wrap 2 + 1, so the last one takes the whole second row rather
              than sitting in half of it. The ! is needed because Tailwind v4 emits custom
              breakpoints ahead of built-in ones, so wide: loses to md: on specificity alone. */}
          {hasExecution && (
            <div className="md:col-span-2 wide:col-span-1! min-w-0">
              <ExecutionPanel excursion={excursion} rMultiple={rMultiple} />
            </div>
          )}

          {/*
           * Says why the row is short instead of leaving a void.
           *
           * Only appears when neither Timing nor Execution has anything to show, which is the
           * normal state for a journal filled entirely by broker sync: SnapTrade sends a date and
           * a fill price, not an entry time, a stop, or MAE/MFE. Without this the dashboard just
           * has a hole in it, and the reasonable reading of a hole is that something is broken.
           */}
          {analyticsPanels === 1 && (
            <div className="panel-card p-3 md:p-4 flex flex-col justify-center min-h-[160px]">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-text-secondary">
                  <Info size={16} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[10px] md:text-sm font-semibold text-text-primary mb-1">
                    Timing and Execution need a little more per trade
                  </h3>
                  <p className="text-[11px] md:text-xs text-text-secondary leading-relaxed">
                    Time-of-day performance needs an entry time, and execution quality needs your
                    stop or the highest and lowest the trade went. A broker sync sends neither — add
                    them when you log a trade or edit an imported one, and both panels appear here.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {hasAnyTrades && <TradingInsightsSection trades={analyticsTrades} />}

      {showShare && (
        <ShareCardModal
          period={mode === 'month' ? 'month' : 'year'}
          stats={mode === 'month' ? stats : yearStats}
          year={year}
          month={month}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
