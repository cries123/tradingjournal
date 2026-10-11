import type { CSSProperties } from 'react';
import type { DirectionGroup } from '../../utils/directionRows';
import { formatCurrency } from '../../utils/format';

type Currency = Parameters<typeof formatCurrency>[1];

interface DirectionPanelProps {
  groups: DirectionGroup[];
  currency?: Currency;
}

const COLUMNS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3' };

/**
 * The direction card's body: long vs short, or calls vs puts — directionSplit decides which.
 *
 * The bars grow in with the card (.bar-in, once the card has scrolled into view) and after that
 * slide to new widths through .chart-bar-h when the period changes. That replaces a frame-timed
 * "animate whenever the trades array changes" toggle, which regrew every bar from zero on each
 * filter change and was the only chart on the page doing its own timing.
 */
export function DirectionPanel({ groups, currency }: DirectionPanelProps) {
  const maxAbs = Math.max(...groups.map((g) => Math.abs(g.pnl)), 1);
  const counted = groups.reduce((sum, g) => sum + g.trades, 0);

  // Side is optional on a Trade, and a hand-typed entry can omit it. Saying so beats an empty card.
  if (counted === 0) {
    return (
      <div className="flex items-center justify-center h-full px-2 text-center text-xs text-text-secondary">
        No trades this period record a direction yet.
      </div>
    );
  }

  return (
    <div className={`grid h-full ${COLUMNS[groups.length] ?? 'grid-cols-2'} content-center gap-x-4 gap-y-2`}>
      {groups.map((group, i) => {
        // A direction you never traded and one that broke even are different facts, so an untraded
        // block is dimmed with its rail dropped rather than drawn as a flat bar.
        const traded = group.trades > 0;
        const isProfit = group.pnl >= 0;
        const widthPct = (Math.abs(group.pnl) / maxAbs) * 100;

        return (
          <div key={group.key} className={traded ? '' : 'opacity-40'}>
            <p className="text-[10px] md:text-[11px] font-medium text-text-secondary">{group.label}</p>
            <p
              className={`mb-1.5 text-base md:text-lg font-semibold leading-tight tabular-nums ${
                isProfit ? 'text-profit-bright' : 'text-loss-bright'
              }`}
            >
              {traded ? formatCurrency(group.pnl, currency) : '—'}
            </p>

            <div
              className={`relative h-2.5 overflow-hidden rounded-full ${
                traded ? 'bg-bg-primary' : 'border border-dashed border-border/40'
              }`}
            >
              {traded && group.pnl !== 0 && (
                <div
                  className={`bar-in chart-bar-h h-full rounded-full ${isProfit ? 'bar-profit-h' : 'bar-loss-h'}`}
                  style={{ width: `${Math.max(widthPct, 3)}%`, '--i': i } as CSSProperties}
                />
              )}
            </div>

            <p className="mt-1 text-[9px] md:text-[10px] text-text-secondary tabular-nums">
              {traded
                ? `${group.trades} ${group.trades === 1 ? 'trade' : 'trades'} · ${Math.round(group.winRate)}% win`
                : 'No trades'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
