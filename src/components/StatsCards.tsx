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
}

export function StatsCards({
  stats,
  periodLabel,
  streakDays = 0,
  goalPnl = 0,
  showBenchmark = false,
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
    <div className={`hero-card ${!isProfit && hasTrades ? 'hero-loss' : ''} shrink-0`}>
      {flip > 0 && <span key={flip} className="hero-flip" aria-hidden />}
      {/*
        One strip of six cells: the net and the five figures that explain it, divided by hairlines.

        It was a card with the net on the left and the figures floating to its right, which on a
        wide screen left the middle of the most-looked-at card blank and on a phone stacked into a
        tall block. As cells of equal weight the strip reads left to right like a statement line. On
        a phone the net takes the full width and the three figures that answer "am I winning" sit
        under it; the other two are on the Insights tab and in Performance.
      */}
      <div className="relative grid grid-cols-3 md:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))]">
        <div className="col-span-3 md:col-span-1 min-w-0 px-4 pt-4 pb-3 md:p-5">
          <p className="text-[12px] text-text-secondary">
            Net P&L{periodLabel ? ` · ${periodLabel}` : ''}
          </p>
          {/* Counts up from zero when the Overview opens, and rolls to the new total when the
              month, the view or a filter changes. tabular-nums so the digits do not jitter
              sideways as they turn over. */}
          <span
            className={`mt-1 block text-4xl md:text-[34px] font-extrabold tracking-tight leading-none tabular-nums ${
              hasTrades ? (isProfit ? 'hero-value-profit' : 'hero-value-loss') : 'text-text-secondary'
            }`}
          >
            {hasTrades ? <CountUp value={stats.netPnl} format={fmt} from={0} /> : '—'}
          </span>
          <p className="text-[12px] text-text-secondary mt-2">
            {hasTrades
              ? `${stats.totalTrades} trade${stats.totalTrades === 1 ? '' : 's'} · ${stats.tradingDays} day${
                  stats.tradingDays === 1 ? '' : 's'
                } · ${fmt(stats.avgProfitPerDay)} a day`
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

        {hasTrades && (
          <dl className="contents">
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
              hint={stats.profitFactor >= 99 ? 'no losers' : stats.profitFactor >= 1 ? 'making money' : 'losing money'}
            />
            {/*
              An em dash rather than a number when there is no loss to divide by.

              avgRR falls back to avgWin when losingTrades is 0, which is a DOLLAR amount — so a
              trader five winners into a new journal read "Avg win/loss 287.00" and saw a 287:1
              ratio. The reasoning was already written against the breakeven hint above; the chip
              it comes from was still printing the number.
            */}
            <HeroMetric label="Avg win/loss" value={hasBothSides ? stats.avgRR.toFixed(2) : '—'} hint="payoff" phoneHidden />
            <HeroMetric
              label="Avg/trade"
              value={fmt(stats.avgProfitPerTrade)}
              tone={tone(stats.avgProfitPerTrade >= 0)}
              hint="per trade"
            />
            <HeroMetric
              label="Wins / losses"
              value={
                <>
                  {stats.winningTrades}W <span className="text-loss-bright">{stats.losingTrades}L</span>
                </>
              }
              phoneHidden
            />
          </dl>
        )}
      </div>

      {goalPnl > 0 && (
        <div className="relative mx-4 mb-4 md:mx-5 flex items-center gap-2.5">
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
 * One cell of the strip: a label, the figure, and a few words saying what the figure means. On a
 * phone the cells sit three across under the net, divided by hairlines; from md up they continue
 * the strip to the right of it.
 */
function HeroMetric({
  label,
  value,
  tone,
  hint,
  title,
  phoneHidden = false,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  hint?: string;
  title?: string;
  /** Left off the phone's three-across row; the Insights tab and Performance carry it there. */
  phoneHidden?: boolean;
}) {
  return (
    <div
      title={title}
      className={`min-w-0 flex flex-col justify-between gap-1 border-t border-white/5 px-3 py-3 md:border-t-0 md:border-l md:px-4 md:py-5 [&:nth-child(n+2)]:border-l ${
        phoneHidden ? 'max-md:hidden' : ''
      }`}
    >
      <dt className="text-[11px] md:text-[12px] text-text-secondary whitespace-nowrap">{label}</dt>
      <dd>
        <span className={`block text-lg md:text-2xl font-bold tabular-nums leading-tight whitespace-nowrap ${tone ?? 'text-text-primary'}`}>
          {value}
        </span>
        {hint && <span className="block mt-0.5 text-[11px] text-text-secondary truncate">{hint}</span>}
      </dd>
    </div>
  );
}
