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
 * The hero's preview of the journal — now actually live.
 *
 * It said "Live preview" over a static calendar with six days filled out of thirty, which read as an
 * empty journal: the opposite of the pitch. It now shows last month from sample data, and every few
 * seconds a sync from Schwab drops the month's final days in, the net P&L counts up and the chips
 * move — the moment the product exists for, shown rather than described.
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

  return (
    <div
      ref={ref}
      className={`glass-card glow-border-brand relative overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ${
        compact ? 'p-3.5' : 'p-4 md:p-5'
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 90% at 8% 0%, rgba(var(--color-profit-bright-rgb), 0.14), transparent 60%), radial-gradient(ellipse 40% 80% at 100% 100%, rgba(var(--color-accent-rgb), 0.1), transparent 60%)',
        }}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-secondary">
            Live preview <span className="normal-case tracking-normal text-text-secondary/70">· sample journal</span>
          </p>
          <p className={`${compact ? 'text-base' : 'text-lg'} font-semibold mt-0.5`}>
            {MONTHS[month]} {year}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">Net P&amp;L</p>
          <span
            className={`hero-value-profit ${compact ? 'text-lg' : 'text-xl md:text-2xl'} font-extrabold leading-none tabular-nums mt-0.5 inline-block`}
          >
            {money2(net)}
          </span>
        </div>
      </div>

      {/* A fixed-height row, so the sync appearing and going never moves the calendar. */}
      <div className="relative h-7 flex items-center justify-end" aria-live="polite">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-opacity duration-300 ${
            phase === 'idle' ? 'opacity-0' : 'opacity-100'
          } ${
            phase === 'done'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
          }`}
        >
          {phase === 'done' ? (
            <>
              <CheckCircle2 size={11} aria-hidden /> {SYNC_DAYS} days imported from Schwab
            </>
          ) : (
            <>
              <RefreshCw size={11} className="motion-safe:animate-spin" aria-hidden /> Syncing Schwab…
            </>
          )}
        </span>
      </div>

      <div className="relative grid grid-cols-7 gap-1 mb-4">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[9px] text-text-secondary text-center py-1">
            {d}
          </div>
        ))}
        {shown.map((cell, i) => {
          if (cell.kind === 'blank') return <div key={`b${i}`} className="h-9 rounded-md bg-bg-primary/30" />;
          const { day, weekend } = cell;
          const pnl = day.pnl;
          const win = pnl !== null && pnl > 0;
          const alpha = pnl !== null ? 0.06 + (Math.abs(pnl) / maxAbs) * 0.22 : 0;
          const tone =
            pnl === null
              ? weekend
                ? 'border-border/20 bg-bg-primary/20'
                : 'border-border/40 bg-bg-card/60'
              : win
                ? 'border-profit-bright/50 ring-1 ring-profit-bright/15 shadow-sm shadow-profit-bright/10'
                : 'border-loss-bright/50 ring-1 ring-loss-bright/15 shadow-sm shadow-loss-bright/10';
          return (
            <div
              key={day.day}
              style={
                pnl === null
                  ? undefined
                  : {
                      background: win
                        ? `linear-gradient(160deg, rgba(var(--color-profit-bright-rgb), ${alpha}), rgba(var(--color-profit-bright-rgb), ${alpha * 0.25}))`
                        : `linear-gradient(160deg, rgba(248, 113, 113, ${alpha}), rgba(248, 113, 113, ${alpha * 0.25}))`,
                    }
              }
              className={`h-9 rounded-md border text-[9px] p-1 flex flex-col justify-between transition-transform duration-200 motion-safe:hover:scale-[1.05] ${tone} ${
                landed.has(day.day) && !reduceMotion ? 'animate-cell-pop' : ''
              } ${day.day === latest ? 'day-today' : ''}`}
            >
              <span className="text-text-secondary leading-none">{day.day}</span>
              {pnl !== null && (
                <span className={`font-bold leading-none truncate ${win ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {money0(pnl)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative flex flex-wrap items-center gap-1.5">
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
