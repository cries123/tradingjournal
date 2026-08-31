import { useEffect, useMemo, useState } from 'react';
import type { Trade } from '../../types';
import { formatCurrency } from '../../utils/format';
import { directionRows } from '../../utils/directionRows';

type Currency = Parameters<typeof formatCurrency>[1];

interface DirectionPanelProps {
  trades: Trade[];
  currency?: Currency;
}

export function DirectionPanel({ trades, currency }: DirectionPanelProps) {
  const rows = useMemo(() => directionRows(trades), [trades]);
  const [animatedFor, setAnimatedFor] = useState<typeof trades | null>(null);
  const animate = animatedFor === trades;

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const sidedTrades = rows.reduce((sum, r) => sum + r.trades, 0);

  /*
   * Bars grow from zero whenever the data changes.
   *
   * Derived rather than toggled: `animate` is false for any data this component has not yet
   * animated, so a new period resets the bars during render instead of needing a synchronous
   * setState inside an effect — which is a second render pass, and the pattern React's own docs
   * point away from. The frame below marks the data as animated, and the bars grow.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedFor(trades));
    return () => cancelAnimationFrame(frame);
  }, [trades]);

  // Side is optional on a Trade, and a hand-typed entry can omit it. Saying so beats an empty card.
  if (sidedTrades === 0) {
    return (
      <div className="flex items-center justify-center h-full px-2 text-center text-xs text-text-secondary">
        No trades this period record a direction yet.
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-2 content-center gap-x-4 gap-y-2">
      {rows.map((row, i) => {
        // A direction you never traded and one that broke even are different facts, so an untraded
        // block is dimmed with its rail dropped rather than drawn as a flat bar.
        const traded = row.trades > 0;
        const isProfit = row.pnl >= 0;
        const widthPct = (Math.abs(row.pnl) / maxAbs) * 100;

        return (
          <div key={row.side} className={traded ? '' : 'opacity-40'}>
            <p className="text-[10px] md:text-[11px] font-medium text-text-secondary">{row.label}</p>
            <p
              className={`mb-1.5 text-base md:text-lg font-semibold leading-tight tabular-nums ${
                isProfit ? 'text-profit-bright' : 'text-loss-bright'
              }`}
            >
              {traded ? formatCurrency(row.pnl, currency) : '—'}
            </p>

            <div
              className={`relative h-2.5 overflow-hidden rounded-full ${
                traded ? 'bg-bg-primary' : 'border border-dashed border-border/40'
              }`}
            >
              {traded && row.pnl !== 0 && (
                <div
                  className={`chart-bar-h h-full rounded-full ${isProfit ? 'bar-profit-h' : 'bar-loss-h'}`}
                  style={{
                    width: animate ? `${Math.max(widthPct, 3)}%` : '0%',
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
              )}
            </div>

            <p className="mt-1 text-[9px] md:text-[10px] text-text-secondary tabular-nums">
              {traded
                ? `${row.trades} ${row.trades === 1 ? 'trade' : 'trades'} · ${Math.round(row.winRate)}% win`
                : 'No trades'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
