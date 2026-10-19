import { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, FileText, Grid3X3, RefreshCw, Share2 } from 'lucide-react';
import type { Filters, Trade } from '../types';
import { computeStats, getMonthTrades, getYearTrades } from '../utils/stats';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { computeJournalingStreak, computeTradingInsights } from '../utils/insights';
import { computeTakeaway } from '../utils/takeaway';
import { useSettings } from '../context/useSettings';
import { PhoneJournalSelect } from './overview/PhoneJournalSelect';
import { useAiTakeaway } from '../hooks/useAiTakeaway';
import { SiteAnnouncement } from './SiteAnnouncement';
import { DuplicateTradesBanner } from './DuplicateTradesBanner';
import { DashboardCalendar } from './DashboardCalendar';
import { TodayCard } from './overview/TodayCard';
import { CostingCard } from './overview/CostingCard';
import { ThisWeekCard } from './overview/ThisWeekCard';
import { TradeLog } from './overview/TradeLog';
import { EmptyDashboard } from './EmptyDashboard';
import { FiltersBar } from './FiltersBar';
import { ShareCardModal } from './ShareCardModal';
import { StatsCards } from './StatsCards';
import { YearMonths } from './YearMonths';
import { TradingInsightsSection } from './analytics/TradingInsightsSection';
import { DirectionPanel } from './analytics/DirectionPanel';
import { TakeawayBanner } from './analytics/TakeawayBanner';
import { SegmentedControl } from './ui/SegmentedControl';
import { Reveal } from './motion/Reveal';
import { directionSplit } from '../utils/directionRows';

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
  /** Opens the CSV importer. See EmptyDashboard for why this screen carries it. */
  onImportCsv?: () => void;
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
  /** Opens the monthly report for the month on screen. */
  onOpenReport?: () => void;
  /** Days on which one of the trader's rules was broken, judged on the active journal alone. */
  ruleDates?: ReadonlySet<string>;
  /** The active journal's trades, unfiltered — what Today is judged against, like the rule banner. */
  ruleTrades?: Trade[];
  /** Opens Settings, where the rules are set. */
  onSetRules?: () => void;
  onOpenPerformance?: () => void;
  /** Opens the full trade list. */
  onAllTrades?: () => void;
}

type PhoneTab = 'calendar' | 'trades' | 'insights';

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
  onImportCsv,
  sampleActive = false,
  onLoadSample,
  onClearSample,
  everyTrade,
  onRemoveTrades,
  onSyncBroker,
  hasBrokerTrades = false,
  onOpenReport,
  ruleDates,
  ruleTrades,
  onSetRules,
  onOpenPerformance,
  onAllTrades,
}: DashboardViewProps) {
  const { settings, viewingAllJournals } = useSettings();
  const [mode, setMode] = useState<DashboardMode>('month');
  const [showShare, setShowShare] = useState(false);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('calendar');
  /** Hidden on a phone unless its tab is the one open; always shown from md up. */
  const onTab = (tab: PhoneTab) => (phoneTab === tab ? '' : 'max-md:hidden');

  const monthTrades = useMemo(() => getMonthTrades(trades, year, month), [trades, year, month]);
  const yearTrades = useMemo(() => getYearTrades(trades, year), [trades, year]);
  const stats = useMemo(() => computeStats(monthTrades), [monthTrades]);
  const yearStats = useMemo(() => computeStats(yearTrades), [yearTrades]);
  const hasFilters = Boolean(filters.symbol || filters.setup || filters.side || filters.tag);
  const analyticsTrades = mode === 'month' ? monthTrades : yearTrades;
  const streakDays = useMemo(() => computeJournalingStreak(trades), [trades]);
  const direction = useMemo(() => directionSplit(analyticsTrades), [analyticsTrades]);
  const periodLabel = mode === 'month' ? formatMonthYear(year, month) : String(year);

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

  const journalName = viewingAllJournals
    ? 'All journals'
    : (settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'Journal');
  const periodHasTrades = mode === 'month' ? monthTrades.length > 0 : yearTrades.length > 0;
  const stepBack = mode === 'month' ? onPrevMonth : onPrevYear;
  const stepForward = mode === 'month' ? onNextMonth : onNextYear;

  const calendar =
    mode === 'month' ? (
      <DashboardCalendar
        year={year}
        month={month}
        trades={trades}
        onDayClick={onDayClick}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onMonthChange={onMonthChange}
        ruleDates={ruleDates}
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
    );

  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* Above everything else: if the numbers below are inflated by a double import, that's the
          first thing the trader needs to know — before they read a single stat. */}
      {everyTrade && onRemoveTrades && (
        <DuplicateTradesBanner trades={everyTrade} onRemove={onRemoveTrades} />
      )}

      <SiteAnnouncement onConnectBroker={onConnectBroker} />

      {/* Phone only. On desktop the sidebar carries the journals, each with its month. */}
      <PhoneJournalSelect />

      {/*
        The screen's toolbar: what you are looking at, then the controls that change it. The filters
        live here because they narrow everything below them, the strip included. Sync and the report
        are desktop-only here — on a phone they are on More and on the Insights tab, and five buttons
        across a 390px screen wrapped to three rows.
      */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0 px-0.5">
        <div className="hidden md:block mr-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">Overview</h1>
          <p className="text-xs text-text-secondary truncate">
            {journalName} · {periodLabel}
          </p>
        </div>

        {/* A phone has no calendar header on the Trades and Insights tabs, so the period is
            stepped here — the one control every tab needs. */}
        <div className="md:hidden flex items-center rounded-xl border border-border bg-bg-tertiary/60">
          <button type="button" onClick={stepBack} aria-label={mode === 'month' ? 'Previous month' : 'Previous year'} className="p-2 text-text-secondary focus-ring rounded-l-xl">
            <ChevronLeft size={16} />
          </button>
          <span className="px-1 text-sm font-semibold tabular-nums whitespace-nowrap">{periodLabel}</span>
          <button type="button" onClick={stepForward} aria-label={mode === 'month' ? 'Next month' : 'Next year'} className="p-2 text-text-secondary focus-ring rounded-r-xl">
            <ChevronRight size={16} />
          </button>
        </div>

        <SegmentedControl
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'month', label: 'Month', icon: Calendar },
            { id: 'year', label: 'Year', icon: Grid3X3 },
          ]}
        />

        {(hasAnyTrades || hasFilters) && (
          <FiltersBar filters={filters} symbols={filterSymbols} setups={filterSetups} onChange={onFiltersChange} />
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Syncing is something you do, not something that happens to you: the broker is only
              ever contacted when the trader presses Sync on the broker screen. So this is a plain
              shortcut to that screen, not a status line about a background job. */}
          {hasBrokerTrades && onSyncBroker && (
            <button
              type="button"
              onClick={onSyncBroker}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors focus-ring"
            >
              <RefreshCw size={13} />
              Sync
            </button>
          )}

          {/* Only for a month with trades in it: the report is of one month. On a plan without it
              the screen it opens explains the plan that has it. */}
          {onOpenReport && mode === 'month' && monthTrades.length > 0 && (
            <button
              type="button"
              onClick={onOpenReport}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors focus-ring"
            >
              <FileText size={14} />
              Monthly report
            </button>
          )}

          {periodHasTrades && (
            <button
              type="button"
              onClick={() => setShowShare(true)}
              aria-label={mode === 'month' ? 'Share month' : 'Share year'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors focus-ring"
            >
              <Share2 size={14} />
              <span className="hidden md:inline">{mode === 'month' ? 'Share month' : 'Share year'}</span>
            </button>
          )}
        </div>
      </header>

      {!hasAnyTrades && (
        <EmptyDashboard
          onAddTrade={onAddTrade}
          onConnectBroker={onConnectBroker}
          onImportCsv={onImportCsv}
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
          // Says so when the figures are every journal added together, so a combined month is
          // never mistaken for the active journal's.
          periodLabel={`${periodLabel}${viewingAllJournals ? ' · All journals' : ''}`}
          streakDays={streakDays}
          goalPnl={mode === 'month' ? settings.monthlyGoalPnl : 0}
          showBenchmark={mode === 'month'}
        />
      )}

      {hasAnyTrades && <TakeawayBanner takeaway={takeaway} aiText={aiTakeawayText} aiPending={aiTakeawayPending} />}

      {!hasAnyTrades ? (
        calendar
      ) : (
        /*
          Two columns from xl up: the period itself (the calendar and its trades) and a rail of what
          to act on (today against your limits, what is costing you, this week).

          Below xl the two columns dissolve (`contents`) and `order` decides the single column: Today
          first, because it is the one card about the next decision, then the tab bar on a phone,
          then the period. On a phone only the open tab's cards are shown; on a tablet everything is,
          in the same order.
        */
        <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="contents xl:flex xl:flex-col xl:gap-3 xl:min-w-0">
            <div className={`min-w-0 max-xl:order-3 ${onTab('calendar')}`}>{calendar}</div>

            {mode === 'month' && (
              <div className={`min-w-0 max-xl:order-4 ${onTab('trades')}`}>
                <TradeLog trades={monthTrades} ruleDates={ruleDates} onDayClick={onDayClick} onAllTrades={onAllTrades} />
              </div>
            )}

          </div>

          <aside className="contents xl:flex xl:flex-col xl:gap-3 xl:sticky xl:top-4">
            <div className="max-xl:order-1">
              <TodayCard trades={ruleTrades ?? trades} onSetRules={onSetRules} />
            </div>
            <div className={`max-xl:order-5 ${onTab('insights')}`}>
              <CostingCard trades={analyticsTrades} periodLabel={periodLabel} onOpenPerformance={onOpenPerformance} />
            </div>
            <div className={`max-xl:order-6 ${onTab('insights')}`}>
              <ThisWeekCard trades={trades} onDayClick={onDayClick} />
            </div>
            {onOpenReport && mode === 'month' && monthTrades.length > 0 && (
              <button
                type="button"
                onClick={onOpenReport}
                className={`md:hidden max-xl:order-6 panel-card w-full flex items-center justify-between p-4 text-left focus-ring ${onTab('insights')}`}
              >
                <span>
                  <span className="block text-[15px] font-semibold">{formatMonthYear(year, month)} report</span>
                  <span className="block text-[13px] text-text-secondary">One page, to print or send</span>
                </span>
                <ChevronRight size={18} className="text-text-secondary" aria-hidden />
              </button>
            )}
          </aside>

          {/* The phone's tabs. Three, because a phone shows one of these at a time and a scroll
              past the calendar to reach the trades was the complaint. */}
          <div role="tablist" aria-label="Overview" className="md:hidden max-xl:order-2 grid grid-cols-3 rounded-xl border border-border bg-bg-tertiary/60 p-1">
            {(['calendar', 'trades', 'insights'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={phoneTab === tab}
                onClick={() => setPhoneTab(tab)}
                className={`rounded-lg py-2 text-sm font-medium transition-colors focus-ring ${
                  phoneTab === tab ? 'bg-bg-secondary text-text-primary shadow-sm' : 'text-text-secondary'
                }`}
              >
                {tab === 'calendar' ? 'Calendar' : tab === 'trades' ? 'Trades' : 'Insights'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Direction and the deeper breakdowns, under the period they describe, at full width: the
          insight grid lays out four figures a row and was built for the whole width, not the
          column beside the rail. On a phone, the end of the Insights tab. */}
      {hasAnyTrades && (
        <div className={`min-w-0 flex flex-col gap-3 ${onTab('insights')}`}>
          <Reveal className="panel-card spotlight p-3 md:p-4 flex flex-col min-h-[160px]">
            <div className="mb-1.5 md:mb-3 shrink-0">
              <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">Direction</p>
              <h3 className="text-sm font-semibold text-text-primary">{direction.title}</h3>
            </div>
            <div className="flex-1 min-h-[80px]">
              <DirectionPanel groups={direction.groups} currency={settings.currency} />
            </div>
          </Reveal>
          <TradingInsightsSection trades={analyticsTrades} periodLabel={periodLabel} />
        </div>
      )}

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
