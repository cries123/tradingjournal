import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { Fmt, VerdictBand } from '../../utils/performanceScreen';
import { Parts } from './PerformanceBreakdowns';

/**
 * What the Performance screen says, before any breakdown says it: where the money goes, where it
 * comes from, and the one change worth making.
 *
 * The drain is the headline, in the largest type under the figures, because it is the one number a
 * trader should carry away. The approved redesign draws the three as one band of cells divided by
 * hairlines, like the figure strip above it, and on a phone folds them into one card: the drain, then
 * the change with the rule simulator beside it. The engine is left off the phone — it is the first
 * row of the breakdown it came from, one tap down.
 */
export function PerformanceVerdict({ band, fmt, onOpenSimulator }: { band: VerdictBand; fmt: Fmt; onOpenSimulator?: () => void }) {
  const { primary, secondary, change } = band;
  const drain = primary.kind === 'drain';
  const big = `${drain ? '' : '+'}${fmt(primary.pnl)}`;
  const cells = 1 + (secondary ? 1 : 0) + (change ? 1 : 0);
  const columns = cells === 3 ? 'grid-cols-[1.25fr_1fr_1fr]' : cells === 2 ? 'grid-cols-[1.25fr_1fr]' : 'grid-cols-1';
  const simulate = change?.cap != null && onOpenSimulator;

  return (
    <>
      {/* ── Desktop: three cells ── */}
      <section
        aria-label="The verdict"
        className={`hidden gap-px overflow-hidden rounded-[14px] border border-white/[0.06] bg-white/[0.06] md:grid ${columns}`}
      >
        <div className="min-w-0 bg-bg-card px-[18px] py-4">
          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
            {drain ? <ArrowDownRight size={12} aria-hidden /> : <ArrowUpRight size={12} aria-hidden />}
            {drain ? 'Where the money goes' : 'Where the money comes from'}
          </p>
          <p className={`mt-1.5 text-[34px] font-extrabold leading-[1.05] tracking-tight tabular-nums ${drain ? 'text-loss-bright' : 'text-profit-bright'}`}>
            {big}
          </p>
          <p className="mt-2 text-[13px] leading-[1.45]">
            {primary.sentence}
            {primary.context && ` ${primary.context}`}
          </p>
        </div>

        {secondary && (
          <div className="min-w-0 bg-bg-card px-[18px] py-4">
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <ArrowUpRight size={12} aria-hidden />
              Where it comes from
            </p>
            <p className="mt-1.5 text-2xl font-bold leading-[1.05] tabular-nums text-profit-bright">+{fmt(secondary.pnl)}</p>
            <p className="mt-2 text-[13px] leading-[1.45] text-text-secondary">{secondary.sentence}</p>
          </div>
        )}

        {change && (
          <div className="min-w-0 bg-bg-card bg-gradient-to-b from-accent/[0.07] to-accent/[0.02] px-[18px] py-4">
            <p className="flex items-center gap-1.5 text-xs text-accent">
              <span aria-hidden>◆</span>
              The one change
            </p>
            <p className="mt-1.5 text-2xl font-bold leading-[1.05]">{change.headline}</p>
            <p className="mt-2 text-[13px] leading-[1.45] text-text-secondary">
              <Parts parts={change.detail} />
            </p>
          </div>
        )}
      </section>

      {/* ── Phone: one card ── */}
      <section aria-label="The verdict" className="panel-card rounded-2xl p-4 md:hidden">
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          {drain ? <ArrowDownRight size={12} aria-hidden /> : <ArrowUpRight size={12} aria-hidden />}
          {drain ? 'Where the money goes' : 'Where the money comes from'}
        </p>
        <p className={`mt-1 text-[30px] font-extrabold tracking-tight tabular-nums ${drain ? 'text-loss-bright' : 'text-profit-bright'}`}>{big}</p>
        <p className="mt-1 text-sm leading-[1.4] text-text-secondary">{primary.sentence}</p>
        {change && (
          <div className="mt-3.5 flex items-center gap-3 border-t border-white/[0.07] pt-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs text-accent">
                <span aria-hidden>◆</span>
                The one change
              </p>
              <p className="mt-1 text-sm font-semibold leading-[1.4]">
                <Parts parts={change.phone} />
              </p>
            </div>
            {simulate && (
              <button type="button" onClick={onOpenSimulator} className="btn-primary h-9 shrink-0 px-3.5 text-[13px] font-bold focus-ring">
                Simulate
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
