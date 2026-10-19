import type { Trade } from '../types';
import { resolveTradeAccountId } from './accounts';

/**
 * Each journal's net for one month, for the journal list in the sidebar and on More.
 *
 * Every journal, not the one in view: the point of putting a figure beside each name is that the
 * trader can see how the paper account did without switching to it. Keyed by the same resolved id
 * the journal screens filter on, so a legacy trade with no accountId counts where it is shown.
 *
 * A journal with no trades that month is absent from the map rather than present at zero — "$0.00"
 * beside a journal reads as a flat month, when nothing was traded at all.
 */
export function journalMonthNets(trades: readonly Trade[], year: number, month: number): Map<string, number> {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const nets = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.date.startsWith(prefix)) continue;
    const id = resolveTradeAccountId(trade.accountId);
    nets.set(id, (nets.get(id) ?? 0) + trade.pnl);
  }
  return nets;
}
