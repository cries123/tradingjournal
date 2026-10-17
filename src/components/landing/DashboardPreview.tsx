import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Flame, RefreshCw } from 'lucide-react';
import { monthStats, sampleMonth, SYNC_DAYS, visibleDays, type SampleDay } from './landingDemo';
import { useCountUp } from '../../hooks/useCountUp';
import { useIsOnScreen } from '../../hooks/useInView';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The hero's loop, in milliseconds from the moment it is on screen. */
const SYNC_STARTS = 1400;
const FIRST_DAY_LANDS = 1000;
const BETWEEN_DAYS = 650;
const HOLD_SYNCED = 4500;
const HOLD_RESET = 2500;

function money0(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
}

function money2(n: number): string {
  return `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Cell = { kind: 'blank' } | { kind: 'day'; day: SampleDay; weekend: boolean };

/**
 * The month's equity line — running P&L, day by day — as an SVG path, scaled to its box.
 *
 * Both the line and the filled area under it, so the chart reads from across the room: the curve
 * is the one shape a trader recognises faster than any number, and it grows as the sync lands.
 */
function equityPaths(days: SampleDay[], width: number, height: number): { line: string; area: string } | null {
  const traded = days.filter((d) => d.pnl !== null);
  if (traded.length < 2) return null;
  let running = 0;
  const totals = traded.map((d) => (running += d.pnl ?? 0));
  const lo = Math.min(0, ...totals);
  const hi = Math.max(0, ...totals);
  const span = Math.max(1, hi - lo);
  const pad = 4;
  const x = (i: number) => (i / (totals.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const pts = totals.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const base = y(0).toFixed(1);
  return { line, area: `${line} L${width} ${base} L0 ${base} Z` };
}

/**
 * The hero's preview of the journal — now actually live.
 *
 * It said "Live preview" over a static calendar with six days filled out of thirty, which read as an
 * empty journal: the opposite of the pitch. It now shows last month from sample data, and every few
 * seconds a sync from Schwab drops the month's final days in, the net P&L counts up, the equity line
 * extends and the chips move — the moment the product exists for, shown rather than described.
 *
 * Drawn at product-shot scale, not dashboard scale: each day is a block you can read the dollars off
 * from arm's length, and the month's net is the largest figure on the landing page. The phone
 * version keeps the smaller cells and the last two weeks, where the sync lands.
 *
 * It starts from the month with those days still to come, not from an empty calendar: the page is
 * prerendered and then rendered again by React, and a preview that began blank would flash from full
 * to empty on every load. Under reduced motion it shows the finished month and never moves. It pauses
 * whenever it is off screen or the tab is hidden.
 */
export function DashboardPreview({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  // Last month, so the sample never shows trades on dates that have not happened yet.
  const [{ year, month }] = useState(() => {
    const now = new Date();
    const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    return { year: m === 11 ? now.getFullYear() - 1 : now.getFullYear(), month: m };
  });
  const sample = useMemo(() => sampleMonth(year, month), [year, month]);
  const reduceMotion = usePrefersReducedMotion();
  const { ref, onScreen } = useIsOnScreen();

  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduceMotion || !onScreen) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    // Each pass starts clean, so coming back to the tab replays the sync rather than resuming it
    // halfway with days already on the calendar.
    at(0, () => {
      setPhase('idle');
      setRevealed(0);
    });
    let t = SYNC_STARTS;
    at(t, () => setPhase('syncing'));
    t += FIRST_DAY_LANDS;
    for (let i = 1; i <= SYNC_DAYS; i++) {
      at(t, () => setRevealed(i));
      t += BETWEEN_DAYS;
    }
    at(t, () => setPhase('done'));
    t += HOLD_SYNCED;
    at(t, () => {
      setPhase('idle');
      setRevealed(0);
    });
    t += HOLD_RESET;
    at(t, () => setCycle((c) => c + 1));

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduceMotion, onScreen, cycle]);

  const shownRevealed = reduceMotion ? SYNC_DAYS : revealed;
  const days = useMemo(() => visibleDays(sample, shownRevealed), [sample, shownRevealed]);
  const stats = useMemo(() => monthStats(days), [days]);
  const net = useCountUp(stats.net);
  const landed = new Set(sample.syncDays.slice(0, shownRevealed));
  const latest = shownRevealed > 0 ? sample.syncDays[shownRevealed - 1] : null;
  const maxAbs = Math.max(...sample.days.map((d) => Math.abs(d.pnl ?? 0)), 1);
  const equity = useMemo(() => equityPaths(days, 600, 72), [days]);

  const cells: Cell[] = [
    ...Array.from({ length: sample.leading }, (): Cell => ({ kind: 'blank' })),
    ...days.map((day, i): Cell => {
      const weekday = (sample.leading + i) % 7;
      return { kind: 'day', day, weekend: weekday === 0 || weekday === 6 };
    }),
  ];
  while (cells.length % 7 !== 0) cells.push({ kind: 'blank' });
  // The phone version shows the last two weeks — where the sync lands.
  const shown = variant === 'compact' ? cells.slice(-14) : cells;
  const compact = variant === 'compact';

  // The phone keeps the small cells the test counts; the full version is drawn at poster scale.
  const cellShape = compact ? 'h-9 rounded-md p-1 text-[9px]' : 'h-14 md:h-[72px] rounded-xl p-2 md:p-2.5 text-[10px] md:text-xs';
  const figureSize = compact ? '' : 'text-xs md:text-lg';

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-[1.25rem] bg-[#0b0b0b] border border-white/5 ${
        compact ? 'p-3.5' : 'p-5 md:p-7'
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 80% at 100% 0%, rgba(var(--color-profit-bright-rgb), 0.12), transparent 60%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-secondary">
            Live preview <span className="normal-case tracking-normal text-text-secondary/70">· sample journal</span>
          </p>
          <p className={`${compact ? 'text-base' : 'text-xl md:text-2xl'} font-semibold mt-1 tracking-tight`}>
            {MONTHS[month]} {year}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">Net P&amp;L</p>
          <span
            className={`text-profit-bright ${compact ? 'text-lg' : 'text-3xl md:text-5xl'} font-bold leading-none tabular-nums tracking-tight mt-1 inline-block`}
          >
            {money2(net)}
          </span>
        </div>
      </div>

      {/* A fixed-height row, so the sync appearing and going never moves the calendar. */}
      <div className={`relative ${compact ? 'h-7' : 'h-9'} flex items-center justify-end`} aria-live="polite">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-opacity duration-300 ${
            phase === 'idle' ? 'opacity-0' : 'opacity-100'
          } ${phase === 'done' ? 'bg-accent text-black' : 'bg-white/10 text-text-primary'}`}
        >
          {phase === 'done' ? (
            <>
              <CheckCircle2 size={12} aria-hidden /> {SYNC_DAYS} days imported from Schwab
            </>
          ) : (
            <>
              <RefreshCw size={12} className="motion-safe:animate-spin" aria-hidden /> Syncing Schwab…
            </>
          )}
        </span>
      </div>

      <div className={`relative grid grid-cols-7 ${compact ? 'gap-1 mb-4' : 'gap-1.5 md:gap-2 mb-5'}`}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className={`${compact ? 'text-[9px]' : 'text-[10px] md:text-[11px]'} text-text-secondary text-center py-1`}>
            {d}
          </div>
        ))}
        {shown.map((cell, i) => {
          if (cell.kind === 'blank') {
            return <div key={`b${i}`} className={`${compact ? 'h-9 rounded-md' : 'h-14 md:h-[72px] rounded-xl'} bg-white/[0.02]`} />;
          }
          const { day, weekend } = cell;
          const pnl = day.pnl;
          const win = pnl !== null && pnl > 0;
          // Fill scales with the size of the day. Capped where the lime figure on a lime fill
          // would stop being legible: a $400 day is a bright block, a $40 day a tint.
          const alpha = pnl !== null ? 0.1 + (Math.abs(pnl) / maxAbs) * 0.3 : 0;
          const tone =
            pnl === null
              ? weekend
                ? 'border-transparent bg-white/[0.02]'
                : 'border-white/5 bg-white/[0.03]'
              : win
                ? 'border-profit-bright/40'
                : 'border-loss-bright/40';
          return (
            <div
              key={day.day}
              style={
                pnl === null
                  ? undefined
                  : {
                      background: win
                        ? `rgba(var(--color-profit-bright-rgb), ${alpha})`
                        : `rgba(248, 113, 113, ${alpha})`,
                    }
              }
              className={`${cellShape} border flex flex-col justify-between transition-transform duration-200 motion-safe:hover:scale-[1.04] ${tone} ${
                landed.has(day.day) && !reduceMotion ? 'animate-cell-pop' : ''
              } ${day.day === latest ? 'day-today' : ''}`}
            >
              <span className="text-text-secondary leading-none">{day.day}</span>
              {pnl !== null && (
                <span className={`${figureSize} font-bold leading-none truncate tabular-nums ${win ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {money0(pnl)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* The month as a line, under the month as a grid. Phone keeps the chips alone. */}
      {!compact && equity && (
        <div className="relative mb-5 rounded-xl border border-white/5 bg-white/[0.02] px-3 pt-3 pb-2">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary mb-1">
            <span>Equity this month</span>
            <span className="normal-case tracking-normal font-medium text-text-secondary/80">
              {stats.winRate}% of days green
            </span>
          </div>
          <svg viewBox="0 0 600 72" preserveAspectRatio="none" className="block w-full h-14 md:h-[72px]" aria-hidden>
            <defs>
              <linearGradient id="preview-equity-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--color-profit-bright-rgb))" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(var(--color-profit-bright-rgb))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={equity.area} fill="url(#preview-equity-fill)" />
            <path d={equity.line} fill="none" stroke="var(--color-profit-bright)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      )}

      <div className="relative flex flex-wrap items-center gap-1.5 md:gap-2">
        {stats.streak > 0 && (
          <span className="stat-chip border-amber-500/30">
            <Flame size={11} className="text-amber-400" />
            <span className="chip-value text-amber-300">
              {stats.streak}-day streak
            </span>
          </span>
        )}
        <span className="stat-chip">
          Win rate <span className="chip-value text-profit-bright">{stats.winRate}%</span>
        </span>
        {!compact && (
          <>
            <span className="stat-chip">
              Avg/day <span className="chip-value text-profit-bright">{money0(stats.avgPerDay)}</span>
            </span>
            <span className="stat-chip">
              Profit factor{' '}
              <span className="chip-value text-profit-bright">
                {Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
