import type { Trade } from '../types';
import { resolveTradeAccountId } from './accounts';

/**
 * The trades the journal screens read: the active journal's, or every journal's in the
 * all-journals view.
 *
 * Pure so the one decision behind every dashboard figure is tested on its own. `viewingAll` must be
 * SettingsContext's viewingAllJournals — the setting already checked against the plan and the
 * journal count — never the raw stored flag.
 */
/**
 * Whether the all-journals view can be offered, and whether it is on.
 *
 * The stored flag alone is not enough: a Silver trader who turned it on and later dropped to Free,
 * or deleted down to one journal, still has it saved. Viewing is the flag AND the plan AND a second
 * journal, so a stale setting can never leave somebody in a combined view they cannot switch off.
 */
export function allJournalsView(input: {
  planIncludesIt: boolean;
  journalCount: number;
  stored: boolean;
}): { canView: boolean; viewing: boolean } {
  const canView = input.planIncludesIt && input.journalCount > 1;
  return { canView, viewing: canView && input.stored };
}

export function tradesInView(trades: Trade[], activeJournalId: string, viewingAll: boolean): Trade[] {
  if (viewingAll) return trades;
  return trades.filter((t) => resolveTradeAccountId(t.accountId) === activeJournalId);
}
