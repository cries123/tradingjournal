import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Flame, Target } from 'lucide-react';
import { CountUp } from './motion/CountUp';
import { useSettings } from '../context/useSettings';
import { useBenchmark } from '../hooks/useBenchmark';
import type { TradingStats } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import { breakevenWinRate } from '../utils/metricVerdict';
import { BenchmarkChip } from './analytics/BenchmarkChip';

interface StatsCardsProps {
  stats: TradingStats;
  periodLabel?: string;
  /** Consecutive days journaled (weekends don't break it). */
  streakDays?: number;
  /** Monthly P&L goal — renders a progress bar when > 0. */
  goalPnl?: number;
  /** Show the vs-SPY comparison. Only true for the month view — the endpoint reports
   *  month-to-date, so pinning it next to a year total would be comparing different windows. */
  showBenchmark?: boolean;
  /** A strip drawn under the figures — the period's running P&L (EquityCurve). */
  sparkline?: ReactNode;
}

export function StatsCards({
  stats,
  periodLabel,
  streakDays = 0,
  goalPnl = 0,
  showBenchmark = false,
  sparkline,
}: StatsCardsProps) {
  const { settings } = useSettings();
  const hasTrades = stats.totalTrades > 0;
  const isProfit = stats.netPnl >= 0;
  const winPct = hasTrades ? stats.winRate : 0;
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  // Comparing dollars to an index's percentage move is meaningless, so the benchmark only loads
  // once the trader has told us what capital those dollars were made on.
  const canCompare = showBenchmark && hasTrades && settings.accountSize > 0;
  const benchmark = useBenchmark(canCompare);
  const returnPct = canCompare ? (stats.netPnl / settings.accountSize) * 100 : 0;

  // Win rate is only meaningful against the rate this trader's own win/loss sizes require.
  // Needs both sides: with no losers avgRR degrades to a raw dollar figure, not a ratio, and
  // feeding that in would produce a confidently wrong "you need 2% winners".
  const hasBothSides = stats.winningTrades > 0 && stats.losingTrades > 0;
  const breakeven = hasBothSides ? breakevenWinRate(stats.avgRR, 1) : null;

  const tone = (good: boolean) => (good ? 'text-profit-bright' : 'text-loss-bright');

  /*
   * The moment the month changes sign.
   *
   * The figure already rolls to its new value; the card did not mark the one change that matters
   * — green to red, or red back to green — so a sync that pushed the month under water looked like
   * any other update. A sweep of the new colour crosses the card once when the sign flips with
   * trades on both sides of the change (a first trade is an arrival, not a flip). The key makes
   * the sweep replay on each flip; reduced motion turns it off in the stylesheet.
   */
  const sign = hasTrades ? isProfit : null;
  const lastSign = useRef<boolean | null>(sign);
  const [flip, setFlip] = useState(0);
  useEffect(() => {
    const was = lastSign.current;
    lastSign.current = sign;
    if (was === null || sign === null || was === sign) return;
    setFlip((n) => n + 1);
  }, [sign]);

  return (
    <div className={`hero-card ${!isProfit && hasTrades ? 'hero-loss' : ''} shrink-0 p-3 md:p-5`}>
      {flip > 0 && <span key={flip} className="hero-flip" aria-hidden />}
      <div className="relative flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
        <div className="min-w-0 shrink-0">
          <p className="text-[9px] md:text-[11px] uppercase tracking-[0.2em] text-text-secondary font-semibold">
            Net P&L{periodLabel ? ` · ${periodLabel}` : ''}
          </p>
          <div className="flex items-end gap-3 mt-0.5 md:mt-1">
            {/* Counts up from zero when the Overview opens, and rolls to the new total when the
                month, the view or a filter changes. tabular-nums so the digits do not jitter
                sideways as they turn over. */}
            <span
              className={`text-3xl md:text-5xl font-extrabold tracking-tight leading-none tabular-nums ${
                hasTrades ? (isProfit ? 'hero-value-profit' : 'hero-value-loss') : 'text-text-secondary'
              }`}
            >
              {hasTrades ? <CountUp value={stats.netPnl} format={fmt} from={0} /> : '—'}
            </span>
          </div>
          <p className="text-[10px] md:text-xs text-text-secondary mt-1.5 md:mt-2">
            {hasTrades
              ? `${stats.totalTrades} trade${stats.totalTrades === 1 ? '' : 's'} · ${stats.tradingDays} day${
                  stats.tradingDays === 1 ? '' : 's'
                } · avg ${fmt(stats.avgProfitPerDay)}/day`
              : 'No trades yet this period — import or log your first session'}
          </p>
          {hasTrades && (streakDays >= 2 || canCompare) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {streakDays >= 2 && (
                <span className="stat-chip border-amber-500/30">
                  <Flame size={11} className="text-amber-400" />
                  <span className="chip-value text-amber-300">{streakDays}-day streak</span>
                </span>
              )}
              {canCompare && <BenchmarkChip returnPct={returnPct} quote={benchmark} />}
            </div>
          )}
        </div>

        {/*
          The figures across the card rather than as a cluster of chips in its right-hand corner.

          On a wide screen the chips sat at the far right with ~900px of empty card between them
          and the net figure — the middle of the most-looked-at card on the page was blank. Spread
          as labelled figures they fill it, and each one is big enough to read at a glance. On a
          phone they stay the compact two-column list they were.
        */}
        {hasTrades && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 md:flex-1 md:grid-cols-3 md:gap-x-6 md:gap-y-4 xl:grid-cols-5 xl:gap-x-0">
            <HeroMetric
              label="Win rate"
              value={`${winPct.toFixed(0)}%`}
              tone={breakeven !== null ? tone(winPct >= breakeven) : undefined}
              hint={breakeven !== null ? `need ${breakeven.toFixed(0)}%` : undefined}
              title={
                breakeven !== null
                  ? `At your average win/loss you need ${breakeven.toFixed(0)}% winners to break even`
                  : undefined
              }
            />
            <HeroMetric
              label="Profit factor"
              value={stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
              tone={tone(stats.profitFactor >= 1)}
            />
            {/*
              An em dash rather than a number when there is no loss to divide by.

              avgRR falls back to avgWin when losingTrades is 0, which is a DOLLAR amount — so a
              trader five winners into a new journal read "Avg win/loss 287.00" and saw a 287:1
              ratio. The reasoning was already written against the breakeven hint above; the chip
              it comes from was still printing the number.
            */}
            <HeroMetric label="Avg win/loss" value={hasBothSides ? stats.avgRR.toFixed(2) : '—'} />
            <HeroMetric
              label="Avg/trade"
              value={fmt(stats.avgProfitPerTrade)}
              tone={tone(stats.avgProfitPerTrade >= 0)}
            />
            <HeroMetric
              label="Wins / losses"
              value={
                <>
                  {stats.winningTrades}W <span className="text-loss-bright">{stats.losingTrades}L</span>
                </>
              }
            />
          </dl>
        )}
      </div>

      {hasTrades && sparkline}

      {hasTrades && (
        <div className="relative mt-2.5 md:mt-4 h-1 rounded-full bg-bg-primary/80 overflow-hidden">
          {/* One bar that grows in from the left as the card arrives, not two that pop. */}
          <div className="bar-in flex h-full w-full">
            <div
              className="chart-bar-h h-full rounded-full bg-gradient-to-r from-profit-bright to-accent"
              style={{ width: `${winPct}%` }}
            />
            <div
              className="chart-bar-h h-full bg-gradient-to-r from-loss-bright/60 to-loss-bright/90"
              style={{ width: `${100 - winPct}%` }}
            />
          </div>
        </div>
      )}

      {goalPnl > 0 && (
        <div className="relative mt-3 flex items-center gap-2.5">
          <Target size={13} className="text-accent shrink-0" />
          <div className="flex-1 h-1.5 rounded-full bg-bg-primary/80 overflow-hidden">
            <div
              className={`bar-in chart-bar-h h-full rounded-full ${
                stats.netPnl >= goalPnl
                  ? 'bg-gradient-to-r from-profit-bright to-accent'
                  : 'bg-gradient-to-r from-accent/60 to-accent'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, (stats.netPnl / goalPnl) * 100))}%`, '--i': 2 } as CSSProperties}
            />
          </div>
          <span className="text-[10px] md:text-xs text-text-secondary shrink-0">
            Goal {fmt(goalPnl)} ·{' '}
            <span className={stats.netPnl >= goalPnl ? 'text-profit-bright font-semibold' : 'text-text-primary'}>
              {stats.netPnl >= goalPnl
                ? 'hit 🎯'
                : `${Math.max(0, (stats.netPnl / goalPnl) * 100).toFixed(0)}%`}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * One labelled figure in the hero. On a phone, label and value on one line like the chips they
 * replaced; from md up, a small caps label over a figure big enough to read across the room. On a
 * wide screen they sit in one row, divided by hairlines.
 */
function HeroMetric({
  label,
  value,
  tone,
  hint,
  title,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  hint?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex items-baseline gap-1 min-w-0 md:flex-col md:items-start md:gap-0.5 xl:border-l xl:border-border/40 xl:px-6"
    >
      <dt className="text-[11px] md:text-[10px] md:uppercase md:tracking-[0.15em] text-text-secondary font-semibold whitespace-nowrap">
        {label}
      </dt>
      <dd className={`text-[11px] md:text-xl font-bold tabular-nums leading-tight whitespace-nowrap ${tone ?? 'text-text-primary'}`}>
        {value}
        {hint && (
          <span className="ml-1.5 text-[10px] md:text-[11px] font-medium text-text-secondary">{hint}</span>
        )}
      </dd>
    </div>
  );
}
