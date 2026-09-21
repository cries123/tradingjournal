import type { Trade } from '../types';
import type { JournalAccount } from '../types/settings';
import { resolveTradeAccountId } from './accounts';

/**
 * Trades belonging to a journal that no longer exists.
 *
 * Removing a journal deletes it from settings.accounts and leaves its trades alone, each still
 * carrying the old accountId. Nothing reads them after that: the dashboard filters to the active
 * journal, and "Clear all" only deletes trades in the active journal. So they sit there —
 * invisible, undeletable, and still counted by everything that walks every trade: backups, the
 * sync dedupe, and (until this was found) the verified track record, where a long-deleted journal
 * of hand-entered trades showed up as "86 hand-entered trades excluded" on an account whose only
 * journal held nothing but broker imports.
 *
 * The same thing happens without anybody deleting anything: trades logged before journals existed
 * carry no accountId at all and resolve to 'default', so replacing the original journal rather
 * than renaming it strands every one of them.
 */

export interface OrphanGroup {
  /** The accountId these trades still carry. Not a journal anybody can see. */
  accountId: string;
  trades: Trade[];
}

/**
 * Groups every trade whose journal is gone, newest group first by size.
 *
 * Grouped rather than returned flat because they can come from more than one deleted journal, and
 * "these 40 were one journal and those 46 another" is the difference between a list somebody can
 * act on and a pile.
 */
export function findOrphanTrades(trades: Trade[], accounts: JournalAccount[]): OrphanGroup[] {
  const live = new Set(accounts.map((a) => a.id));
  const groups = new Map<string, Trade[]>();

  for (const trade of trades) {
    const id = resolveTradeAccountId(trade.accountId);
    if (live.has(id)) continue;
    const existing = groups.get(id);
    if (existing) existing.push(trade);
    else groups.set(id, [trade]);
  }

  return [...groups.entries()]
    .map(([accountId, group]) => ({ accountId, trades: group }))
    .sort((a, b) => b.trades.length - a.trades.length || a.accountId.localeCompare(b.accountId));
}

/** Total count across every group, for the one-line summary. */
export function countOrphans(groups: OrphanGroup[]): number {
  return groups.reduce((sum, g) => sum + g.trades.length, 0);
}

/**
 * A readable name for a journal that is gone.
 *
 * 'default' is worth naming specifically: it is not a journal somebody deleted, it is where every
 * trade logged before journals existed still lives, and telling that person they have trades from
 * a "deleted journal" would send them looking for something they never deleted.
 */
export function describeOrphanSource(accountId: string): string {
  return accountId === 'default'
    ? 'Logged before you had separate journals'
    : 'A journal that has since been deleted';
}
