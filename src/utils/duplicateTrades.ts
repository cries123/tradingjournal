import type { Trade } from '../types';
import { resolveTradeAccountId } from './accounts';

/**
 * Finds broker-imported trades that got written into a journal more than once.
 *
 * This exists because of a real incident: an automatic broker sync could fire while the journal
 * was still loading from Firestore, so it built its dedupe set from an empty list and re-imported
 * the trader's entire history as "new". That sync has been removed and syncing is manual again,
 * but that only stops it happening again — the rows it already wrote are still sitting in people's
 * journals, and only a cleanup gets them out.
 *
 * WHAT COUNTS AS A DUPLICATE
 * Only trades that share a sourceId inside the same journal. sourceId is the broker's own stable
 * id for a round trip ("snaptrade:<open>:<close>"), so two rows carrying it are provably the same
 * fill reported twice — there is no judgement call and no way for this to be a coincidence.
 *
 * Deliberately NOT matched: trades with no sourceId. A manually-logged trade has no stable id, and
 * two trades on the same symbol, same day, for the same amount are something traders genuinely do
 * — scaling into a level, taking the same setup twice. Guessing at those would mean this cleanup
 * could delete real work, which is a worse failure than leaving a duplicate on screen. Journals are
 * kept separate for the same reason: collapsing across them would silently touch a journal the
 * trader wasn't looking at.
 */

export interface DuplicateReport {
  /** The redundant copies — safe to delete. Never includes the copy being kept. */
  duplicates: Trade[];
  /** How many distinct trades were affected, which is what a person actually wants told to them. */
  affectedTrades: number;
  /** Net P&L the duplicates are inflating the journal by. */
  duplicatedPnl: number;
}

export const EMPTY_DUPLICATE_REPORT: DuplicateReport = {
  duplicates: [],
  affectedTrades: 0,
  duplicatedPnl: 0,
};

/**
 * How much the trader has invested in this particular row.
 *
 * When the same trade exists twice, one copy may be the one they wrote notes on, tagged, graded or
 * attached a chart to, and the other is a bare re-import. Keeping the annotated copy is the whole
 * difference between a cleanup and a second incident.
 */
function annotationWeight(trade: Trade): number {
  let score = 0;
  if (trade.notes?.trim()) score += 4;
  if (trade.imageUrls?.length) score += 4;
  if (trade.chartUrl?.trim()) score += 3;
  if (trade.tags?.length) score += 2;
  if (trade.setup?.trim()) score += 2;
  if (trade.grade) score += 2;
  if (trade.strategyId) score += 1;
  if (typeof trade.checklistScore === 'number') score += 1;
  return score;
}

function duplicateKey(trade: Trade): string | null {
  if (!trade.sourceId) return null;
  return `${resolveTradeAccountId(trade.accountId)}|${trade.sourceId}`;
}

/**
 * Returns the copies that should go, keeping exactly one of each real trade.
 *
 * The keeper is the most annotated copy; ties go to whichever was saved first, and then to
 * whichever came first in the list, so the answer is stable across runs and doesn't depend on
 * Firestore's document ordering.
 */
export function findDuplicateTrades(trades: Trade[]): DuplicateReport {
  const groups = new Map<string, { trade: Trade; index: number }[]>();

  trades.forEach((trade, index) => {
    const key = duplicateKey(trade);
    if (!key) return;
    const group = groups.get(key);
    if (group) group.push({ trade, index });
    else groups.set(key, [{ trade, index }]);
  });

  const duplicates: Trade[] = [];
  let affectedTrades = 0;
  let duplicatedPnl = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const ranked = [...group].sort((a, b) => {
      const weight = annotationWeight(b.trade) - annotationWeight(a.trade);
      if (weight !== 0) return weight;
      const savedA = a.trade.savedAt ?? '';
      const savedB = b.trade.savedAt ?? '';
      if (savedA !== savedB) {
        // A missing savedAt sorts last: a row we can't date is the weaker claim to being original.
        if (!savedA) return 1;
        if (!savedB) return -1;
        return savedA.localeCompare(savedB);
      }
      return a.index - b.index;
    });

    affectedTrades++;
    for (const { trade } of ranked.slice(1)) {
      duplicates.push(trade);
      duplicatedPnl += trade.pnl;
    }
  }

  return { duplicates, affectedTrades, duplicatedPnl };
}
