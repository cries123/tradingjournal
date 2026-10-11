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
    return { side, label: side === 'long' ? 'Long' : 'Short', ...summarise(xs) };
  });
}

export interface DirectionGroup {
  key: string;
  label: string;
  pnl: number;
  trades: number;
  winRate: number;
}

export interface DirectionSplit {
  title: string;
  groups: DirectionGroup[];
}

/**
 * The split the dashboard's direction card shows: long against short, or calls against puts.
 *
 * Long vs short was half a card for most of the people using this. A 0DTE options trader buys
 * calls and buys puts — every trade is "long" — so the card read "Long: everything" beside a dimmed
 * "Short: no trades" every month, and the bet they actually make in each trade, up or down, was
 * nowhere on it. For them direction IS calls against puts.
 *
 * So: anyone who has sold short in the period gets long vs short, because then that is the
 * question. Anyone who has not, and trades options, gets calls vs puts, with shares as a third
 * group only if they traded any. Option rows with no call/put recorded are left out rather than
 * guessed — the same rule directionRows applies to a trade with no side.
 */
export function directionSplit(trades: Trade[]): DirectionSplit {
  const anyShort = trades.some((t) => t.side === 'short');
  const calls = trades.filter((t) => t.assetType === 'option' && t.optionType === 'call');
  const puts = trades.filter((t) => t.assetType === 'option' && t.optionType === 'put');

  if (anyShort || calls.length + puts.length === 0) {
    return {
      title: 'Long vs Short',
      groups: directionRows(trades).map(({ side, ...rest }) => ({ key: side, ...rest })),
    };
  }

  const shares = trades.filter((t) => t.assetType === 'stock');
  const groups: DirectionGroup[] = [
    { key: 'call', label: 'Calls', ...summarise(calls) },
    { key: 'put', label: 'Puts', ...summarise(puts) },
  ];
  if (shares.length > 0) groups.push({ key: 'stock', label: 'Shares', ...summarise(shares) });

  return { title: shares.length > 0 ? 'Calls, puts and shares' : 'Calls vs Puts', groups };
}

function summarise(xs: Trade[]): { pnl: number; trades: number; winRate: number } {
  const wins = xs.filter((t) => effectivePnl(t) > 0).length;
  return {
    pnl: xs.reduce((sum, t) => sum + effectivePnl(t), 0),
    trades: xs.length,
    winRate: xs.length ? (wins / xs.length) * 100 : 0,
  };
}
