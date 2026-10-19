import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Lightbulb } from 'lucide-react';
import type { Trade } from '../../types';
import { formatCurrency } from '../../utils/format';
import { performanceVerdict, type Finding } from '../../utils/performanceVerdict';
import { useReveal } from '../../hooks/useReveal';

type Currency = Parameters<typeof formatCurrency>[1];

/**
 * The three lines the Performance screen says, before the panels say them twelve ways.
 *
 * The biggest drain is the headline, in the largest type on the page, because it is the one
 * figure a trader should carry away. The biggest engine beside it says what to keep doing. The
 * change under them is the instruction the drain points at, when it points at one — a cap, a
 * pause, a size — rather than a fact about a ticker.
 */
export function PerformanceVerdict({
  trades,
  currency,
  periodLabel,
}: {
  trades: Trade[];
  currency: Currency;
  periodLabel: string;
}) {
  const fmt = useMemo(() => (n: number) => formatCurrency(n, currency), [currency]);
  const verdict = useMemo(() => performanceVerdict(trades, fmt), [trades, fmt]);
  const { ref, revealProps } = useReveal();

  if (!verdict || (!verdict.drain && !verdict.engine)) return null;

  // A journal with nothing that lost leads with what made the money.
  const headline: Finding = verdict.drain ?? verdict.engine!;
  const second: Finding | null = verdict.drain ? verdict.engine : null;
  const headlineLoss = headline.pnl < 0;

  return (
    <section
      ref={ref}
      {...revealProps}
      aria-label="The verdict"
      className="reveal panel-card spotlight p-4 md:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium">
          The verdict · {periodLabel}
        </p>
        <p className="text-[11px] text-text-secondary tabular-nums">
          Net{' '}
          <span className={`font-semibold ${verdict.net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {fmt(verdict.net)}
          </span>{' '}
          over {verdict.trades} trades
        </p>
      </div>

      <div className="mt-3 grid gap-4 md:mt-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-8">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-secondary">
            {headlineLoss ? (
              <ArrowDownRight size={12} className="text-loss-bright" aria-hidden />
            ) : (
              <ArrowUpRight size={12} className="text-profit-bright" aria-hidden />
            )}
            {headlineLoss ? 'Where the money goes' : 'Where the money comes from'}
          </p>
          <p
            className={`mt-1 text-4xl md:text-6xl font-extrabold tracking-tight tabular-nums leading-none ${
              headlineLoss ? 'text-loss-bright' : 'text-profit-bright'
            }`}
          >
            {headlineLoss ? '−' : '+'}
            {fmt(Math.abs(headline.pnl))}
          </p>
          <p className="mt-2 text-sm md:text-base text-text-primary leading-snug max-w-xl">
            {headlineLoss ? verdict.lines.drain : verdict.lines.engine}
          </p>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {second && (
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-secondary">
                <ArrowUpRight size={12} className="text-profit-bright" aria-hidden />
                Where it comes from
              </p>
              <p className="mt-1 text-2xl md:text-3xl font-bold tabular-nums leading-none text-profit-bright">
                +{fmt(second.pnl)}
              </p>
              <p className="mt-1.5 text-xs md:text-sm text-text-secondary leading-snug">{verdict.lines.engine}</p>
            </div>
          )}

          {verdict.change && (
            <div className="rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-accent">
                <Lightbulb size={12} aria-hidden />
                The one change
              </p>
              <p className="mt-1 text-xs md:text-sm text-text-primary leading-snug">{verdict.change.text}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
