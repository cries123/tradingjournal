import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';

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
