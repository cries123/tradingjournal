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
 * WHAT COUNTS AS A DUPLICATE — two ways, both restricted to broker-imported rows.
 *
 * 1. Same sourceId, same journal. sourceId is the broker's own id for a round trip
 *    ("snaptrade:<open>:<close>"), so two rows carrying it are provably the same fill twice.
 *
 * 2. Same execution fingerprint, same journal. This exists because sourceId turned out NOT to be
 *    stable: when SnapTrade's activity payload had no id of its own, the importer synthesised one
 *    ending in Math.random(), so the same fill got a different sourceId on every sync. Those
 *    duplicates are real but invisible to rule 1, and there are potentially thousands of them.
 *    The fingerprint is date + symbol + side + quantity + entry price + exit price + entry time +
 *    exit time + P&L — every execution detail the broker reported. Two round trips agreeing on all
 *    of that, down to the minute of entry and exit, are the same trade; a trader cannot open and
 *    close two separate positions at identical times for identical prices.
 *
 * Deliberately NOT matched: trades with no sourceId at all. A manually-logged trade has no broker
 * record behind it, and two trades on the same symbol, same day, for the same amount are something
 * traders genuinely do — scaling into a level, taking the same setup twice. Guessing at those would
 * mean this cleanup could delete real work, which is worse than leaving a duplicate on screen.
 * Journals are kept separate for the same reason: collapsing across them would silently touch a
 * journal the trader wasn't looking at.
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
 * Every execution detail the broker reported, as one key. Journal-agnostic on purpose.
 *
 * Exported because the Sync button needs the same notion of "this is the same fill" that the
 * cleanup uses. Comparing sourceIds alone is not enough after the random-id bug: rows already in
 * people's journals carry random sourceIds that nothing will ever match again, so a sync that only
 * checked sourceId would import the whole history one final time. Matching on the execution itself
 * recognises those rows for what they are.
 *
 * A field being absent is part of the key, so a sparse row only ever matches another equally
 * sparse row rather than collapsing into a rich one.
 */
export function executionFingerprint(
  trade: Pick<
    Trade,
    'date' | 'symbol' | 'side' | 'contract' | 'quantity' | 'tradePrice' | 'exitPrice' | 'entryTime' | 'exitTime' | 'pnl'
  >,
): string {
  return [
    trade.date,
    trade.symbol,
    trade.side ?? '',
    trade.contract ?? '',
    trade.quantity ?? '',
    trade.tradePrice ?? '',
    trade.exitPrice ?? '',
    trade.entryTime ?? '',
    trade.exitTime ?? '',
    trade.pnl,
  ].join('|');
}

/**
 * The cleanup's grouping key: the fingerprint, scoped to one journal.
 *
 * Only rows carrying a sourceId qualify — a manually-logged trade has no broker record behind it,
 * and two identical manual entries are something traders genuinely do.
 */
function executionKey(trade: Trade): string | null {
  if (!trade.sourceId) return null;
  return `${resolveTradeAccountId(trade.accountId)}|${executionFingerprint(trade)}`;
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

  // Fingerprint first: it catches everything the sourceId rule catches (two rows with one sourceId
  // necessarily describe the same execution) plus the random-sourceId duplicates it cannot see.
  // Falling back to the sourceId key keeps rows that lack execution detail — an older import, or a
  // broker that reported no times — grouped the way they always were.
  trades.forEach((trade, index) => {
    const key = executionKey(trade) ?? duplicateKey(trade);
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

export interface DedupeResult {
  /** Trades not already present in the journal, safe to import. */
  fresh: Partial<Trade>[];
  /** Already known — counted so the UI can say "you're up to date" rather than "found nothing". */
  alreadyKnown: number;
  /** Dropped because nothing about them could ever be recognised again. */
  unidentified: number;
}

/**
 * Decides which trades off a broker sync are actually new. The only implementation — both the
 * manual sync and the background sync call this.
 *
 * They used to filter separately, and the two filters had drifted: the manual one dropped rows
 * with no sourceId and cross-checked an execution fingerprint, while the background one did
 * neither and pushed every row it could not match. Whichever is more careful, having two of these
 * means the careless one eventually runs.
 *
 * Two independent ways to recognise a trade, because one is not enough:
 *  - sourceId, the broker's id for the round trip. The normal path.
 *  - the execution fingerprint, for rows imported before the id bug was fixed. Their sourceIds
 *    carry a random component that will never match again, so a sourceId-only check would
 *    re-import every one of them on the first sync after the fix.
 *
 * A row with no sourceId at all is dropped rather than imported. Nothing about it can be matched
 * on the next sync, so importing it guarantees a fresh copy every time — which is precisely how a
 * background sync running unattended turns one unidentifiable fill into a hundred.
 */
export function dedupeIncomingTrades(
  incoming: Partial<Trade>[],
  existingTrades: Trade[],
  /** Carried across accounts in one run, so two accounts reporting the same round trip add it once. */
  seen: Set<string> = new Set(),
): DedupeResult {
  for (const t of existingTrades) {
    if (t.sourceId) {
      seen.add(`id:${t.sourceId}`);
      seen.add(`fp:${executionFingerprint(t)}`);
    }
  }

  const fresh: Partial<Trade>[] = [];
  let alreadyKnown = 0;
  let unidentified = 0;

  for (const trade of incoming) {
    if (!trade.sourceId) {
      unidentified++;
      continue;
    }

    const idKey = `id:${trade.sourceId}`;
    const fpKey = `fp:${executionFingerprint(trade as Trade)}`;
    if (seen.has(idKey) || seen.has(fpKey)) {
      alreadyKnown++;
      continue;
    }

    seen.add(idKey);
    seen.add(fpKey);
    fresh.push(trade);
  }

  return { fresh, alreadyKnown, unidentified };
}
