import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';
import { tradesByDay } from './tradingRules';

/**
 * Where a trade sat in its day and against the trader's habits — the facts the Trades page flags
 * beside a trade without anyone typing them in.
 *
 * All of it is computed from what the broker sends: the day's order (tradesByDay, the order the
 * rules read), the running total before the trade, and quantity against the trader's own usual
 * size. Nothing here needs a fill time, so it works on a Schwab import.
 */
export interface TradeContext {
  /** 1-based position in its day. */
  position: number;
  dayCount: number;
  /** The day's total before this trade was taken. */
  dayBefore: number;
  /** The trader's median quantity, or null with too few sized trades to call anything usual. */
  usualQuantity: number | null;
  /** Half again the usual size or more. */
  oversized: boolean;
}

/** Below this many sized trades a median is a guess, and calling a trade "oversized" against it is noise. */
const MIN_SIZED_TRADES = 10;
/** 1.5×: a size step a trader notices in their own account, not the jitter between 4 and 5 contracts. */
const OVERSIZED = 1.5;

export function usualQuantity(trades: readonly Trade[]): number | null {
  const sizes = trades.map((t) => t.quantity).filter((q): q is number => q != null && Number.isFinite(q) && q > 0).sort((a, b) => a - b);
  if (sizes.length < MIN_SIZED_TRADES) return null;
  const mid = Math.floor(sizes.length / 2);
  return sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2;
}

export function tradeContext(trade: Trade, trades: readonly Trade[], usual: number | null = usualQuantity(trades)): TradeContext {
  const day = tradesByDay([...trades]).get(trade.date) ?? [trade];
  const index = Math.max(0, day.findIndex((t) => t.id === trade.id));
  const dayBefore = day.slice(0, index).reduce((sum, t) => sum + effectivePnl(t), 0);
  return {
    position: index + 1,
    dayCount: day.length,
    dayBefore,
    usualQuantity: usual,
    oversized: usual != null && trade.quantity != null && trade.quantity >= usual * OVERSIZED,
  };
}
