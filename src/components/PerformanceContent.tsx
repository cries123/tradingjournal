import { useMemo, useState, type ReactNode } from 'react';
import type { Filters, Trade } from '../types';
import { useSettings } from '../context/useSettings';
import { computeStats, getMonthTrades, getYearTrades } from '../utils/stats';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { brokerCoverage } from '../utils/brokerAnalytics';
import { breakdownsCsv, buildBreakdowns, findEntry } from '../utils/performanceBreakdowns';
import {
  drawdownFromPeak,
  drawdownHint,
  matchesFilters,
  periodWords,
  verdictBand,
  whole,
  type Scope,
} from '../utils/performanceScreen';
import { tradeTags } from '../utils/tradeHelpers';
import { saveBlob } from '../utils/downloadJson';
import { CountUp } from './motion/CountUp';
import { SegmentedControl } from './ui/SegmentedControl';
import { FilterMenu, PeriodStepper } from './overview/ToolbarControls';
import { PhoneJournalSelect } from './overview/PhoneJournalSelect';
import { PerformanceVerdict } from './analytics/PerformanceVerdict';
import { PerformanceBreakdowns, PhoneBreakdownPage } from './analytics/PerformanceBreakdowns';

interface PerformanceContentProps {
  trades: Trade[];
  year: number;
  month: number;
  /** Kept for JournalApp's call. The screen is a sidebar and bottom-bar destination, so it draws no back link of its own. */
  onBack?: () => void;
  /** Opens the rule simulator. Without it the cap findings still show, with nowhere to click through to. */
  onOpenSimulator?: () => void;
}

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

const NO_FILTERS: Filters = { symbol: '', setup: '', side: '', tag: '' };

const toneOf = (good: boolean | null) => (good === null ? '' : good ? 'text-profit-bright' : 'text-loss-bright');

/**
 * How you traded, rather than how much you made — the approved redesign of the Performance screen.
 *
 * Top to bottom it reads as an answer. The figures strip says how the period went; the verdict says
 * where the money went, where it came from and the one change worth making; the breakdowns, biggest
 * first, show the working. The version before it opened on the verdict and then stacked a dozen
 * cards, each with its own sentence, so the reader had to find the $5,000 finding among the $300
 * ones and notice for themselves that three of them were the same leak.
 *
 * Everything on it is computed from what a broker import carries — symbol, side, size, price, date
 * and fees — so a trader who has only ever pressed Sync lands on a full page. What needs a field
 * somebody types (setups, entry times, R, MAE/MFE, a checklist) is named at the bottom of the list
 * with what to record, not drawn as an empty card.
 *
 * It opens on the year rather than the month, unlike the Overview: every breakdown needs a sample
 * before it says anything, and a month often does not clear it. The period and the filter are this
 * screen's own, so narrowing the analysis here does not quietly narrow the Overview.
 */
export function PerformanceContent({ trades, year, month, onOpenSimulator }: PerformanceContentProps) {
  const { settings, viewingAllJournals } = useSettings();
  const fmt = useMemo(() => (n: number) => formatCurrency(n, settings.currency), [settings.currency]);

  const [scope, setScope] = useState<Scope>('year');
  const [cursor, setCursor] = useState({ year, month });
  // Taken once (react-hooks/purity), for "this year" against "in 2025".
  const [now] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [phoneOpen, setPhoneOpen] = useState<string | null>(null);

  const step = (dir: 1 | -1) =>
    setCursor((c) => {
      if (scope !== 'month') return { ...c, year: c.year + dir };
      const m = c.month + dir;
      return { year: c.year + (m < 0 ? -1 : m > 11 ? 1 : 0), month: (m + 12) % 12 };
    });

  const inPeriod = useMemo(
    () => (scope === 'month' ? getMonthTrades(trades, cursor.year, cursor.month) : scope === 'year' ? getYearTrades(trades, cursor.year) : trades),
    [trades, scope, cursor],
  );
  const scoped = useMemo(() => inPeriod.filter((t) => matchesFilters(t, filters)), [inPeriod, filters]);

  // The filter's choices come from the whole journal, so they do not vanish when the period moves.
  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol).filter(Boolean))].sort(), [trades]);
  const setups = useMemo(
    () => [...new Set([...(settings.setupTags ?? []), ...trades.flatMap(tradeTags)])].sort(),
    [trades, settings.setupTags],
  );

  const words = useMemo(() => periodWords(scope, cursor.year, cursor.month, now), [scope, cursor, now]);
  const stats = useMemo(() => computeStats(scoped), [scoped]);
  const coverage = useMemo(() => brokerCoverage(scoped), [scoped]);
  const drawdown = useMemo(() => drawdownFromPeak(scoped), [scoped]);
  const band = useMemo(() => verdictBand(scoped, fmt, words, coverage), [scoped, fmt, words, coverage]);
  const set = useMemo(() => buildBreakdowns(scoped, fmt, words, coverage), [scoped, fmt, words, coverage]);

  const periodLabel = scope === 'month' ? formatMonthYear(cursor.year, cursor.month) : scope === 'year' ? String(cursor.year) : 'All time';
  const stepLabel = scope === 'month' ? new Date(cursor.year, cursor.month, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : periodLabel;
  const journalName = viewingAllJournals
    ? 'All journals'
    : (settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'Journal');

  const has = scoped.length > 0;
  const tradeCount = `${stats.totalTrades} trade${stats.totalTrades === 1 ? '' : 's'}`;
  const days = `${tradeCount} · ${stats.tradingDays} day${stats.tradingDays === 1 ? '' : 's'}`;
  const breakeven = coverage.breakeven;
  const need = breakeven ? breakeven.requiredWinRate : null;
  const pf = stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2);
  const cost = coverage.cost;

  const page = findEntry(set, phoneOpen);

  const exportCsv = () => {
    try {
      const slug = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      saveBlob(new Blob([breakdownsCsv(set, periodLabel)], { type: 'text/csv;charset=utf-8' }), `trend-chasers-performance-${slug}.csv`);
    } catch {
      // saveBlob throws only where the browser cannot save a file at all; there is nothing to retry.
    }
  };

  const toolButton = 'inline-flex items-center gap-1.5 rounded-[9px] border border-border px-[11px] py-1.5 text-xs text-text-secondary hover:text-text-primary focus-ring';
  const anyFilter = Boolean(filters.symbol || filters.setup || filters.side || filters.tag);

  let body: ReactNode;
  if (trades.length === 0) {
    body = <Notice>Nothing to analyze yet. Import from a broker or add a trade and this fills in.</Notice>;
  } else if (inPeriod.length === 0) {
    body = <Notice>No trades in {periodLabel}. Try a wider period.</Notice>;
  } else if (!has) {
    body = <Notice>No trades in {periodLabel} match the filter.</Notice>;
  } else {
    body = (
      <>
        {/* ── Desktop: six figures ── */}
        <section className="hidden grid-cols-6 gap-px overflow-hidden rounded-[14px] border border-white/[0.06] bg-white/[0.06] md:grid">
          <Kpi label="Net P&L" value={<CountUp value={stats.netPnl} format={fmt} from={0} />} tone={toneOf(stats.netPnl >= 0)} hint={days} />
          <Kpi
            label="Win rate"
            value={`${stats.winRate.toFixed(0)}%`}
            tone={toneOf(need === null ? null : stats.winRate >= need)}
            hint={need === null ? 'needs wins and losses to judge' : `need ${need.toFixed(0)}% at your payoff`}
          />
          <Kpi
            label="Profit factor"
            value={pf}
            tone={toneOf(stats.profitFactor >= 1)}
            hint={stats.profitFactor >= 99 ? 'no losing trades' : stats.profitFactor >= 1 ? 'over 1.0 — making money' : 'under 1.0 — losing'}
          />
          <Kpi label="Expectancy" value={fmt(stats.avgProfitPerTrade)} tone={toneOf(stats.avgProfitPerTrade >= 0)} hint="per trade" />
          <Kpi
            label="Max drawdown"
            value={drawdown.depth > 0 ? whole(-drawdown.depth, fmt) : whole(0, fmt)}
            tone={drawdown.depth > 0 ? 'text-loss-bright' : ''}
            hint={drawdownHint(drawdown, scope)}
          />
          <Kpi
            label="Fees"
            value={cost ? whole(cost.fees, fmt) : '—'}
            tone={cost && cost.shareOfGross >= 20 ? 'text-loss-bright' : ''}
            hint={!cost ? 'none recorded' : cost.grossProfit > 0 ? `${cost.shareOfGross.toFixed(0)}% of gross profit` : 'no gross profit to take from'}
          />
        </section>

        {/* ── Phone: the net, and the three figures that answer "am I winning" ── */}
        <section className="md:hidden">
          <p className="text-[13px] text-text-secondary">Net P&L · {periodLabel}</p>
          <span className={`mt-0.5 block text-[36px] font-extrabold leading-[1.05] tracking-tight tabular-nums ${toneOf(stats.netPnl >= 0)}`}>
            <CountUp value={stats.netPnl} format={fmt} from={0} />
          </span>
          <p className="mt-1.5 text-[13px] tabular-nums text-text-secondary">{days}</p>
          <div className="mt-3 grid grid-cols-3 rounded-2xl border border-white/[0.07] bg-bg-card">
            <PhoneStat
              label="Win rate"
              value={`${stats.winRate.toFixed(0)}%`}
              tone={toneOf(need === null ? null : stats.winRate >= need)}
              hint={need === null ? undefined : `need ${need.toFixed(0)}%`}
            />
            <PhoneStat label="Profit factor" value={pf} tone={toneOf(stats.profitFactor >= 1)} hint={stats.profitFactor >= 1 ? 'winning' : 'losing'} />
            <PhoneStat label="Per trade" value={whole(stats.avgProfitPerTrade, fmt)} tone={toneOf(stats.avgProfitPerTrade >= 0)} hint="expectancy" />
          </div>
        </section>

        {band && <PerformanceVerdict band={band} fmt={fmt} onOpenSimulator={onOpenSimulator} />}

        {set.list.length > 0 || set.edge || set.missing.length > 0 ? (
          <PerformanceBreakdowns set={set} fmt={fmt} onOpenSimulator={onOpenSimulator} onPhoneOpen={setPhoneOpen} />
        ) : null}

        {set.list.length === 0 && !set.edge && (
          <Notice>Not enough trades in {periodLabel} to break down yet — each breakdown needs at least five, and a group three of its own.</Notice>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-2 md:gap-4">
      {page && (
        <PhoneBreakdownPage
          entry={page}
          periodLabel={periodLabel}
          period={words}
          fmt={fmt}
          onBack={() => setPhoneOpen(null)}
          onOpenSimulator={onOpenSimulator}
        />
      )}

      <div className={`flex flex-col gap-3 md:gap-4 ${page ? 'max-md:hidden' : ''}`}>
        {/* ── Desktop toolbar ── */}
        <header className="hidden flex-wrap items-center gap-3 border-b border-white/[0.06] pb-3 pt-0.5 md:flex">
          <h1 className="text-lg font-bold">Performance</h1>
          <span className="text-[13px] text-text-secondary">
            {journalName} · <b className="font-medium text-text-primary">{periodLabel}</b> · {tradeCount}
          </span>
          {scope !== 'all' && <PeriodStepper variant="desktop" label={periodLabel} onPrev={() => step(-1)} onNext={() => step(1)} noun={scope} />}
          <SegmentedControl label="Period" value={scope} onChange={setScope} options={SCOPES} />
          {trades.length > 0 && <FilterMenu variant="desktop" filters={filters} symbols={symbols} setups={setups} onChange={setFilters} />}
          <span className="flex-1" />
          {has && (
            <button type="button" onClick={exportCsv} className={toolButton}>
              Export
            </button>
          )}
        </header>

        {/* ── Phone header ── */}
        <div className="md:hidden">
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[26px] font-extrabold leading-none tracking-tight">Performance</h1>
              <div className="mt-1.5">
                {settings.accounts.length > 1 ? <PhoneJournalSelect /> : <span className="text-[13px] text-text-secondary">{journalName}</span>}
              </div>
            </div>
            {scope !== 'all' && <PeriodStepper variant="phone" label={stepLabel} onPrev={() => step(-1)} onNext={() => step(1)} noun={scope} />}
          </div>
          {/* Stretched across the screen, as drawn; the filter only appears here once one is set (from a wider screen). */}
          <div className="mt-3.5 flex items-center gap-2 [&>[role=group]]:flex-1 [&>[role=group]]:justify-between [&>[role=group]_button]:px-4 [&>[role=group]_button]:py-2 [&>[role=group]_button]:text-[13px]">
            <SegmentedControl label="Period" value={scope} onChange={setScope} options={SCOPES} />
            {anyFilter && <FilterMenu variant="phone" filters={filters} symbols={symbols} setups={setups} onChange={setFilters} />}
          </div>
        </div>

        {body}
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="panel-card rounded-[14px] p-10 text-center">
      <p className="text-sm text-text-secondary">{children}</p>
    </div>
  );
}

/** One cell of the desktop strip. */
function Kpi({ label, value, tone, hint }: { label: string; value: ReactNode; tone: string; hint?: string }) {
  return (
    <div className="flex min-h-[88px] min-w-0 flex-col justify-between bg-bg-card px-4 py-3.5">
      <p className="text-xs text-text-secondary">{label}</p>
      <div>
        <span className={`mt-1.5 block whitespace-nowrap text-2xl font-bold leading-[1.05] tracking-tight tabular-nums ${tone || 'text-text-primary'}`}>{value}</span>
        {hint && <span className="mt-1 block truncate text-[11px] text-text-secondary">{hint}</span>}
      </div>
    </div>
  );
}

/** One of the phone's three figures. */
function PhoneStat({ label, value, tone, hint }: { label: string; value: string; tone: string; hint?: string }) {
  return (
    <div className="px-3 py-3 [&+&]:border-l [&+&]:border-white/[0.07]">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`mt-1 text-xl font-bold leading-none tabular-nums ${tone || 'text-text-primary'}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
}
