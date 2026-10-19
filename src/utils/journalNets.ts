import type { Trade } from '../types';
import { resolveTradeAccountId } from './accounts';

/**
 * Each journal's net over all its trades, for the journal list in the sidebar and on More.
 *
 * All time, not the month on screen. Jay: "the number next to the journal name should be overall
 * pnl not just the selected month". The Overview already shows the month; the figure beside a
 * journal's name answers a different question, how that journal stands overall, and a month figure
 * there changed every time the trader stepped the calendar.
 *
 * Every journal, not the one in view: the point of putting a figure beside each name is that the
 * trader can see how the paper account did without switching to it. Keyed by the same resolved id
 * the journal screens filter on, so a legacy trade with no accountId counts where it is shown.
 *
 * A journal with no trades is absent from the map rather than present at zero: "$0.00" beside a
 * journal reads as break-even, when nothing was traded at all.
 */
export function journalNets(trades: readonly Trade[]): Map<string, number> {
  const nets = new Map<string, number>();
  for (const trade of trades) {
    const id = resolveTradeAccountId(trade.accountId);
    nets.set(id, (nets.get(id) ?? 0) + trade.pnl);
  }
  return nets;
}
