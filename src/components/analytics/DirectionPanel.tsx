import { useEffect, useMemo, useState } from 'react';
import type { Trade } from '../../types';
import { formatCurrency } from '../../utils/format';
import { effectivePnl } from '../../utils/tradeHelpers';

type Currency = Parameters<typeof formatCurrency>[1];

export interface DirectionRow {
  side: 'long' | 'short';
  label: string;
  pnl: number;
  trades: number;
  winRate: number;
}

/**
 * Long/short split for the dashboard.
 *
 * Deliberately not computeDirectionSplit from behaviourFacts: that one returns null unless BOTH
 * directions clear a four-trade sample, which is the right bar for asserting a pattern in prose
 * and the wrong one for a panel that just reports what happened. A month of nothing but longs is
 * a fact worth showing, not a reason to blank the card.
 */
export function directionRows(trades: Trade[]): DirectionRow[] {
  return (['long', 'short'] as const).map((side) => {
    const xs = trades.filter((t) => t.side === side);
    const wins = xs.filter((t) => effectivePnl(t) > 0).length;
    return {
      side,
      label: side === 'long' ? 'Long' : 'Short',
      pnl: xs.reduce((sum, t) => sum + effectivePnl(t), 0),
      trades: xs.length,
      winRate: xs.length ? (wins / xs.length) * 100 : 0,
    };
  });
}

interface DirectionPanelProps {
  trades: Trade[];
  currency?: Currency;
}

export function DirectionPanel({ trades, currency }: DirectionPanelProps) {
  const rows = useMemo(() => directionRows(trades), [trades]);
  const [animate, setAnimate] = useState(false);

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const sidedTrades = rows.reduce((sum, r) => sum + r.trades, 0);

  useEffect(() => {
    setAnimate(false);
    const frame = requestAnimationFrame(() => setAnimate(true));
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
