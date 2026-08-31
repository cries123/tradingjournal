import type { Trade } from '../types';

/**
 * How a trade is named in a list.
 *
 * Lives beside the other trade helpers rather than inside the row component: it is a pure
 * function of a trade, several screens format trades without rendering that row, and a module
 * that exports both a component and plain functions cannot be hot-reloaded.
 */
export function tradeBasicLabel(trade: Partial<Trade>): string {
  const parts = [trade.symbol ?? ''];
  if (trade.optionType) parts.push(trade.optionType.toUpperCase());
  if (trade.side) parts.push(trade.side.charAt(0).toUpperCase() + trade.side.slice(1));
  return parts.filter(Boolean).join(' ');
}

export function tradeBasicSubtitle(trade: Partial<Trade>): string | undefined {
  if (trade.contract) return trade.contract;
  if (trade.strike != null && trade.expiration) {
    return `$${trade.strike} · ${trade.expiration}`;
  }
  return trade.notes;
}
