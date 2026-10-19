import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Target } from 'lucide-react';
import { CountUp } from './motion/CountUp';
import { useSettings } from '../context/useSettings';
import { useBenchmark } from '../hooks/useBenchmark';
import type { TradingStats } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import { breakevenWinRate } from '../utils/metricVerdict';
import { BenchmarkChip } from './analytics/BenchmarkChip';

interface StatsCardsProps {
  stats: TradingStats;
  /** "September 2026", "2026" — and "· All journals" when the figures are every journal together. */
  periodLabel?: string;
  /** The phone's shorter label: "September". */
  phoneLabel?: string;
  /** Consecutive days journaled (weekends don't break it). */
  streakDays?: number;
  /** Monthly P&L goal — renders a progress bar when > 0. */
  goalPnl?: number;
  /** Show the vs-SPY comparison. Only true for the month view — the endpoint reports
   *  month-to-date, so pinning it next to a year total would be comparing different windows. */
  showBenchmark?: boolean;
  /** The period's running total at the end of each trading day, for the sparkline. */
  series?: number[];
  /** The period before, for the phone's "Aug +$390.99" — null when there was nothing traded in it. */
  previous?: { label: string; net: number } | null;
}

/** The running total as a line; a soft fill under it on the phone, where it runs edge to edge. */
function Sparkline({ values, fill, className }: { values: number[]; fill: boolean; className: string }) {
  const gradient = useId();
  if (values.length < 2) return null;
  const all = [0, ...values];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const w = 100;
  const h = 40;
  const pts = all.map((v, i) => [(i / (all.length - 1)) * w, 4 + ((max - v) / span) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const color = values.at(-1)! >= 0 ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      {fill && (
        <>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.25" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${w} ${h} L0 ${h}Z`} fill={`url(#${gradient})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={fill ? 2 : 1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The period's figures: the net and the five that explain it.
 *
 * On desktop, one strip of six equal cells divided by hairlines, each figure with a few words saying
 * what it means — read left to right like a statement line. On a phone, the net in big type with a
 * sparkline under it and the three figures that answer "am I winning" beneath; the rest are a tap
 * away on Performance. The two are drawn separately rather than squeezed into one, because the
 * approved designs differ and a strip of six does not fit 390px.
 */
export function StatsCards({
  stats,
  periodLabel,
  phoneLabel,
  streakDays = 0,
  goalPnl = 0,
  showBenchmark = false,
  series = [],
  previous = null,
}: StatsCardsProps) {
  const { settings } = useSettings();
  const hasTrades = stats.totalTrades > 0;
  const isProfit = stats.netPnl >= 0;
  const winPct = hasTrades ? stats.winRate : 0;
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const whole = (n: number) => formatCurrency(Math.round(n), settings.currency).replace(/\.00$/, '');

  // Comparing dollars to an index's percentage move is meaningless, so the benchmark only loads
  // once the trader has told us what capital those dollars were made on.
  const canCompare = showBenchmark && hasTrades && settings.accountSize > 0;
  const benchmark = useBenchmark(canCompare);
  const returnPct = canCompare ? (stats.netPnl / settings.accountSize) * 100 : 0;

  // Win rate is only meaningful against the rate this trader's own win/loss sizes require. Needs
  // both sides: with no losers avgRR degrades to a raw dollar figure, not a ratio, and feeding that
  // in would produce a confidently wrong "you need 2% winners".
  const hasBothSides = stats.winningTrades > 0 && stats.losingTrades > 0;
  const breakeven = hasBothSides ? breakevenWinRate(stats.avgRR, 1) : null;

  const tone = (good: boolean) => (good ? 'text-profit-bright' : 'text-loss-bright');
  const netTone = hasTrades ? (isProfit ? 'hero-value-profit' : 'hero-value-loss') : 'text-text-secondary';

  /*
   * The moment the period changes sign.
   *
   * The figure already rolls to its new value; nothing marked the one change that matters — green to
   * red, or red back to green — so a sync that pushed the month under water looked like any other
   * update. A sweep of the new colour crosses the figure once when the sign flips with trades on both
   * sides of the change (a first trade is an arrival, not a flip). The key makes the sweep replay on
   * each flip; reduced motion turns it off in the stylesheet.
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

  const net = hasTrades ? <CountUp value={stats.netPnl} format={fmt} from={0} /> : '—';
  const sweep = flip > 0 && <span key={flip} className="hero-flip" aria-hidden />;
  const lossClass = !isProfit && hasTrades ? 'hero-loss' : '';
  const days = `${stats.totalTrades} trade${stats.totalTrades === 1 ? '' : 's'} · ${stats.tradingDays} day${stats.tradingDays === 1 ? '' : 's'}`;

  return (
    <>
      {/* ── Desktop: the strip ── */}
      <section className="hidden md:grid grid-cols-6 gap-px overflow-hidden rounded-[14px] border border-white/[0.06] bg-white/[0.06] shrink-0">
        <div className={`relative flex min-h-[92px] flex-col justify-between overflow-hidden bg-bg-card px-4 py-3.5 ${lossClass}`}>
          {sweep}
          {/* The period is in the toolbar right above; the label only says when the figure is every
              journal together, so a combined month is never mistaken for the active journal's. */}
          <p className="relative text-xs text-text-secondary">Net P&L{periodLabel?.includes('All journals') ? ' · All journals' : ''}</p>
          <Sparkline values={series} fill={false} className="absolute right-3.5 top-3.5 h-7 w-[88px]" />
          <div className="relative">
            <span className={`mt-1.5 block text-[28px] font-bold leading-[1.05] tracking-tight tabular-nums ${netTone}`}>{net}</span>
            <p className="mt-1 text-[11px] text-text-secondary">
              {hasTrades ? (
                <>
                  {days} · <b className={`font-semibold ${tone(stats.avgProfitPerDay >= 0)}`}>{fmt(stats.avgProfitPerDay)}</b>/day
                </>
              ) : (
                'No trades yet this period'
              )}
            </p>
            {canCompare && (
              <div className="mt-1.5">
                <BenchmarkChip returnPct={returnPct} quote={benchmark} />
              </div>
            )}
          </div>
        </div>

        <dl className="contents">
          <Cell
            label="Win rate"
            value={hasTrades ? `${winPct.toFixed(0)}%` : '—'}
            tone={breakeven !== null ? tone(winPct >= breakeven) : undefined}
            hint={
              breakeven !== null ? (
                <>
                  need <b className="font-semibold">{breakeven.toFixed(0)}%</b> at your payoff
                </>
              ) : undefined
            }
            title={breakeven !== null ? `At your average win/loss you need ${breakeven.toFixed(0)}% winners to break even` : undefined}
          />
          <Cell
            label="Profit factor"
            value={!hasTrades ? '—' : stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
            tone={hasTrades ? tone(stats.profitFactor >= 1) : undefined}
            hint={!hasTrades ? undefined : stats.profitFactor >= 99 ? 'no losing trades' : stats.profitFactor >= 1 ? 'over 1.0 — making money' : 'under 1.0 — losing'}
          />
          <Cell
            label="Expectancy"
            value={hasTrades ? fmt(stats.avgProfitPerTrade) : '—'}
            tone={hasTrades ? tone(stats.avgProfitPerTrade >= 0) : undefined}
            hint="per trade"
          />
          {/*
            Dollars each side, then the ratio. With no losers there is no loss to divide by, so the
            ratio is a dash rather than avgRR — which falls back to the average WIN in that case and
            once printed as a 287-to-1 payoff for a trader five winners into a new journal.
          */}
          <Cell
            label="Avg win / loss"
            value={
              hasTrades ? (
                <>
                  <span className="text-profit-bright">{stats.winningTrades > 0 ? whole(stats.avgWin) : '—'}</span>
                  <span className="text-text-secondary/60"> / </span>
                  <span className="text-loss-bright">{stats.losingTrades > 0 ? whole(stats.avgLoss) : '—'}</span>
                </>
              ) : (
                '—'
              )
            }
            hint={hasTrades ? `payoff ${hasBothSides ? `${stats.avgRR.toFixed(2)}×` : '—'}` : undefined}
          />
          <Cell
            label="Days"
            value={hasTrades ? String(stats.tradingDays) : '—'}
            hint={
              hasTrades ? (
                <>
                  <b className="font-semibold text-profit-bright">{stats.greenDays}</b> green · <b className="font-semibold text-loss-bright">{stats.redDays}</b> red
                  {streakDays >= 2 && ` · ${streakDays} day streak`}
                </>
              ) : undefined
            }
          />
        </dl>
      </section>

      {/* ── Phone: the hero and three figures ── */}
      <section className="md:hidden shrink-0">
        <div className={`relative overflow-hidden px-0.5 pt-1 ${lossClass}`}>
          {sweep}
          <p className="relative text-[13px] text-text-secondary">Net P&L · {phoneLabel ?? periodLabel}</p>
          <span className={`relative mt-0.5 block text-[40px] font-extrabold leading-[1.05] tracking-tight tabular-nums ${netTone}`}>{net}</span>
          <div className="relative mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
            <span className="tabular-nums">{hasTrades ? days : 'No trades yet this period'}</span>
            {previous && (
              <span className="rounded-full border border-border bg-bg-tertiary px-2 py-[3px] text-xs tabular-nums">
                {previous.label} <span className={tone(previous.net >= 0)}>{previous.net >= 0 ? '+' : ''}{fmt(previous.net)}</span>
              </span>
            )}
          </div>
        </div>
        <Sparkline values={series} fill className="-mx-3 mt-2.5 block h-[46px] w-[calc(100%+1.5rem)]" />
        {hasTrades && (
          <div className="mt-1 grid grid-cols-3 rounded-2xl border border-white/[0.07] bg-bg-card">
            <PhoneStat label="Win rate" value={`${winPct.toFixed(0)}%`} tone={breakeven !== null ? tone(winPct >= breakeven) : undefined} hint={breakeven !== null ? `need ${breakeven.toFixed(0)}%` : undefined} />
            <PhoneStat
              label="Profit factor"
              value={stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
              tone={tone(stats.profitFactor >= 1)}
              hint={stats.profitFactor >= 1 ? 'winning' : 'losing'}
            />
            <PhoneStat label="Per trade" value={whole(stats.avgProfitPerTrade)} tone={tone(stats.avgProfitPerTrade >= 0)} hint="expectancy" />
          </div>
        )}
      </section>

      {goalPnl > 0 && (
        <div className="flex items-center gap-2.5 px-1">
          <Target size={13} className="text-accent shrink-0" />
          <div className="flex-1 h-1.5 rounded-full bg-bg-primary/80 overflow-hidden">
            <div
              className={`bar-in chart-bar-h h-full rounded-full ${
                stats.netPnl >= goalPnl ? 'bg-gradient-to-r from-profit-bright to-accent' : 'bg-gradient-to-r from-accent/60 to-accent'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, (stats.netPnl / goalPnl) * 100))}%`, '--i': 2 } as CSSProperties}
            />
          </div>
          <span className="text-[10px] md:text-xs text-text-secondary shrink-0">
            Goal {fmt(goalPnl)} ·{' '}
            <span className={stats.netPnl >= goalPnl ? 'text-profit-bright font-semibold' : 'text-text-primary'}>
              {stats.netPnl >= goalPnl ? 'hit 🎯' : `${Math.max(0, (stats.netPnl / goalPnl) * 100).toFixed(0)}%`}
            </span>
          </span>
        </div>
      )}
    </>
  );
}

/** One cell of the desktop strip. */
function Cell({ label, value, tone, hint, title }: { label: string; value: ReactNode; tone?: string; hint?: ReactNode; title?: string }) {
  return (
    <div title={title} className="flex min-h-[92px] min-w-0 flex-col justify-between bg-bg-card px-4 py-3.5">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd>
        <span className={`mt-1.5 block text-2xl font-bold leading-[1.05] tracking-tight tabular-nums whitespace-nowrap ${tone ?? 'text-text-primary'}`}>{value}</span>
        {hint && <span className="mt-1 block truncate text-[11px] text-text-secondary">{hint}</span>}
      </dd>
    </div>
  );
}

/** One of the phone's three figures. */
function PhoneStat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="px-3 py-3 [&+&]:border-l [&+&]:border-white/[0.07]">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`mt-1 text-xl font-bold leading-none tabular-nums ${tone ?? 'text-text-primary'}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
}
