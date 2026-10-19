import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, FileText, RefreshCw, Share2 } from 'lucide-react';
import type { Filters, Trade } from '../types';
import { computeStats, dailyRunningTotals, getMonthTrades, getYearTrades } from '../utils/stats';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { computeJournalingStreak } from '../utils/insights';
import { useSettings } from '../context/useSettings';
import { PhoneJournalSelect } from './overview/PhoneJournalSelect';
import { SiteAnnouncement } from './SiteAnnouncement';
import { DuplicateTradesBanner } from './DuplicateTradesBanner';
import { DashboardCalendar } from './DashboardCalendar';
import { TodayCard } from './overview/TodayCard';
import { CostingCard } from './overview/CostingCard';
import { ThisWeekCard } from './overview/ThisWeekCard';
import { TradeLog } from './overview/TradeLog';
import { ScoreCard } from './overview/ScoreCard';
import { FilterMenu, OverflowMenu, PeriodStepper } from './overview/ToolbarControls';
import { EmptyDashboard } from './EmptyDashboard';
import { ShareCardModal } from './ShareCardModal';
import { StatsCards } from './StatsCards';
import { YearMonths } from './YearMonths';
import { SegmentedControl } from './ui/SegmentedControl';

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
  /** Kept for callers; the period is stepped with the toolbar's arrows. */
  onMonthChange?: (year: number, month: number) => void;
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

/**
 * The Overview, as the approved designs draw it.
 *
 * Desktop: a toolbar (the period, Month/Year, filters as chips, Sync, Report, Share), a strip of six
 * figures, then the calendar and the trade log beside a rail of what to act on — today against your
 * limits, what is costing you, this week, and the score.
 *
 * Phone: the title with the journal under it and the period beside it, the net in big type with a
 * sparkline, the three figures that answer "am I winning", today against your limits, then Calendar
 * / Trades / Insights tabs that stay pinned under the header once you scroll past them.
 *
 * Gone from this screen in the redesign, deliberately: the takeaway banner and the insight grid
 * (Direction, the score's five bars, the rule-violation list). What is costing you carries the
 * findings now, at the Performance screen's own threshold, and the day page carries the breaches.
 */
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
  const analyticsTrades = mode === 'month' ? monthTrades : yearTrades;
  const streakDays = useMemo(() => computeJournalingStreak(trades), [trades]);
  const series = useMemo(() => dailyRunningTotals(analyticsTrades), [analyticsTrades]);
  const periodLabel = mode === 'month' ? formatMonthYear(year, month) : String(year);
  const monthName = new Date(year, month, 15).toLocaleDateString('en-US', { month: 'long' });
  const shortLabel = mode === 'month' ? new Date(year, month, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : String(year);

  // The period before, for the phone's "Aug +$390.99" — only when something was traded in it.
  const previous = useMemo(() => {
    const prevTrades = mode === 'month' ? getMonthTrades(trades, month === 0 ? year - 1 : year, (month + 11) % 12) : getYearTrades(trades, year - 1);
    if (prevTrades.length === 0) return null;
    const label = mode === 'month' ? new Date(year, month - 1, 15).toLocaleDateString('en-US', { month: 'short' }) : String(year - 1);
    return { label, net: prevTrades.reduce((s, t) => s + t.pnl, 0) };
  }, [trades, mode, year, month]);

  const journalName = viewingAllJournals
    ? 'All journals'
    : (settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'Journal');
  const periodHasTrades = analyticsTrades.length > 0;
  const stepBack = mode === 'month' ? onPrevMonth : onPrevYear;
  const stepForward = mode === 'month' ? onNextMonth : onNextYear;
  const report = onOpenReport && mode === 'month' && monthTrades.length > 0 ? onOpenReport : undefined;
  const periodNet = (mode === 'month' ? stats : yearStats).netPnl;

  /*
   * The phone's tabs stay pinned under the header once scrolled past, with the period and its net
   * beside them so the figure stays on screen. A sentinel above the bar says when it has stuck.
   */
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [hasAnyTrades]);

  const calendar =
    mode === 'month' ? (
      <DashboardCalendar year={year} month={month} trades={trades} onDayClick={onDayClick} ruleDates={ruleDates} onOpenReport={report} />
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

  const toolButton = 'inline-flex items-center gap-1.5 rounded-[9px] border border-border px-[11px] py-1.5 text-xs text-text-secondary hover:text-text-primary focus-ring';

  return (
    <div className="flex flex-col gap-3 pb-2 md:gap-4">
      {/* Above everything else: if the numbers below are inflated by a double import, that's the
          first thing the trader needs to know — before they read a single stat. */}
      {everyTrade && onRemoveTrades && <DuplicateTradesBanner trades={everyTrade} onRemove={onRemoveTrades} />}

      <SiteAnnouncement onConnectBroker={onConnectBroker} />

      {/* ── Desktop toolbar ── */}
      <header className="hidden md:flex flex-wrap items-center gap-3 border-b border-white/[0.06] pb-3 pt-0.5">
        <h1 className="text-lg font-bold">Overview</h1>
        <span className="text-[13px] text-text-secondary">
          {journalName} · <b className="font-medium text-text-primary">{periodLabel}</b>
        </span>
        <PeriodStepper variant="desktop" label={periodLabel} onPrev={stepBack} onNext={stepForward} noun={mode} />
        <SegmentedControl
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'month', label: 'Month' },
            { id: 'year', label: 'Year' },
          ]}
        />
        {hasAnyTrades && <FilterMenu variant="desktop" filters={filters} symbols={filterSymbols} setups={filterSetups} onChange={onFiltersChange} />}
        <span className="flex-1" />
        {/* Syncing is something you do, not something that happens to you: the broker is only ever
            contacted when the trader presses Sync on the broker screen, so this is a shortcut there. */}
        {hasBrokerTrades && onSyncBroker && (
          <button type="button" onClick={onSyncBroker} className={toolButton}>
            <RefreshCw size={12} aria-hidden />
            Sync
          </button>
        )}
        {report && (
          <button type="button" onClick={report} className={toolButton}>
            Report
          </button>
        )}
        {periodHasTrades && (
          <button type="button" onClick={() => setShowShare(true)} className={toolButton}>
            Share
          </button>
        )}
      </header>

      {/* ── Phone header ── */}
      <div className="md:hidden">
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-extrabold leading-none tracking-tight">Overview</h1>
            <div className="mt-1.5">
              {settings.accounts.length > 1 ? <PhoneJournalSelect /> : <span className="text-[13px] text-text-secondary">{journalName}</span>}
            </div>
          </div>
          <PeriodStepper variant="phone" label={shortLabel} onPrev={stepBack} onNext={stepForward} noun={mode} />
        </div>
        <div className="mt-3.5 flex items-center gap-2">
          <SegmentedControl
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { id: 'month', label: 'Month' },
              { id: 'year', label: 'Year' },
            ]}
          />
          {hasAnyTrades ? (
            <FilterMenu variant="phone" filters={filters} symbols={filterSymbols} setups={filterSetups} onChange={onFiltersChange} />
          ) : (
            <span className="ml-auto" />
          )}
          <OverflowMenu
            items={[
              ...(periodHasTrades ? [{ label: mode === 'month' ? 'Share month' : 'Share year', icon: <Share2 size={16} />, run: () => setShowShare(true) }] : []),
              ...(report ? [{ label: `${monthName} report`, icon: <FileText size={16} />, run: report }] : []),
              ...(hasBrokerTrades && onSyncBroker ? [{ label: 'Sync broker', icon: <RefreshCw size={16} />, run: onSyncBroker }] : []),
            ]}
          />
        </div>
      </div>

      {!hasAnyTrades && (
        <EmptyDashboard onAddTrade={onAddTrade} onConnectBroker={onConnectBroker} onImportCsv={onImportCsv} onLoadSample={onLoadSample} />
      )}

      {sampleActive && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 shrink-0">
          <p className="text-xs text-amber-300">You're viewing example data — it disappears when you add your own trades or refresh.</p>
          {onClearSample && (
            <button type="button" onClick={onClearSample} className="text-xs font-medium text-amber-300 hover:text-amber-200 underline focus-ring rounded">
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
          phoneLabel={mode === 'month' ? monthName : String(year)}
          streakDays={streakDays}
          goalPnl={mode === 'month' ? settings.monthlyGoalPnl : 0}
          showBenchmark={mode === 'month'}
          series={series}
          previous={previous}
        />
      )}

      {!hasAnyTrades ? (
        calendar
      ) : (
        /*
          Two columns from xl up: the period itself (the calendar and its trades) and a rail of what
          to act on. Below xl the columns dissolve (`contents`) and `order` decides the single
          column: Today first, because it is the one card about the next decision, then — on a phone —
          the tabs, then the period. On a phone only the open tab's cards are shown.
        */
        <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-4">
          <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
            <div className={`min-w-0 max-xl:order-3 ${onTab('calendar')}`}>{calendar}</div>
            {mode === 'month' && (
              <div className={`min-w-0 max-xl:order-4 ${onTab('trades')}`}>
                <TradeLog
                  trades={monthTrades}
                  ruleTrades={ruleTrades}
                  ruleDates={ruleDates}
                  onDayClick={onDayClick}
                  onAllTrades={onAllTrades}
                  periodName={monthName}
                />
              </div>
            )}
            {mode === 'year' && phoneTab === 'trades' && (
              <p className="md:hidden max-xl:order-4 text-[13px] text-text-secondary">Pick a month to see its trades.</p>
            )}
          </div>

          <aside className="contents xl:sticky xl:top-4 xl:flex xl:flex-col xl:gap-4">
            <div className="max-xl:order-1">
              <TodayCard trades={ruleTrades ?? trades} onSetRules={onSetRules} />
            </div>
            <div className={`max-xl:order-5 ${onTab('insights')}`}>
              <CostingCard trades={analyticsTrades} periodLabel={periodLabel} onOpenPerformance={onOpenPerformance} />
            </div>
            <div className={`max-xl:order-6 ${onTab('insights')}`}>
              <ThisWeekCard trades={trades} onDayClick={onDayClick} />
            </div>
            <div className={`max-xl:order-7 ${onTab('insights')}`}>
              <ScoreCard trades={analyticsTrades} />
            </div>
            {report && (
              <button
                type="button"
                onClick={report}
                className={`md:hidden max-xl:order-8 panel-card flex w-full items-center justify-between p-4 text-left focus-ring ${onTab('insights')}`}
              >
                <span>
                  <span className="block text-[15px] font-bold">{monthName} report</span>
                  <span className="mt-0.5 block text-[13px] text-text-secondary">One page, ready to print or send</span>
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-tertiary text-text-secondary" aria-hidden>
                  <ChevronRight size={18} />
                </span>
              </button>
            )}
          </aside>

          {/* The phone's tabs, pinned under the header once scrolled past. Both pieces are direct
              children of this column so the bar can stick for its whole height — a sticky element
              only sticks inside its parent. The sentinel's negative margin cancels the column gap. */}
          <div ref={sentinel} aria-hidden className="md:hidden max-xl:order-2 -mb-3 h-0" />
          <div className="md:hidden max-xl:order-2 sticky top-0 z-10 -mx-2 border-b border-white/[0.06] bg-bg-primary px-2 pb-0.5">
            <div>
              {stuck && (
                <div className="flex h-[52px] items-center justify-between">
                  <b className="text-[17px]">{mode === 'month' ? monthName : year}</b>
                  <span className={`text-[15px] font-bold tabular-nums ${periodNet >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                    {formatCurrency(periodNet, settings.currency)}
                  </span>
                </div>
              )}
              <div role="tablist" aria-label="Overview" className="mb-3 grid h-[42px] grid-cols-3 rounded-[13px] border border-border bg-bg-tertiary p-[3px]">
                {(['calendar', 'trades', 'insights'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={phoneTab === tab}
                    onClick={() => setPhoneTab(tab)}
                    className={`rounded-[10px] text-sm transition-colors focus-ring ${
                      phoneTab === tab ? 'bg-[#232323] font-semibold text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {tab === 'calendar' ? 'Calendar' : tab === 'trades' ? 'Trades' : 'Insights'}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
