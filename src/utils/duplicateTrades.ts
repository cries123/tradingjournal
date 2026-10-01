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
 * WHAT COUNTS AS A DUPLICATE: the same sourceId in the same journal, and nothing else. sourceId is
 * the broker's own id for a round trip ("snaptrade:<open>:<close>"), so two rows carrying it are
 * provably one fill written twice.
 *
 * The cleanup used to ALSO group by execution fingerprint, to catch the duplicates left behind by
 * a bug that put Math.random() in synthesised sourceIds. That was dropped, because the fingerprint
 * is only as discriminating as the data the broker sent and Schwab sends no fill times: without
 * them it reduces to date + contract + side + size + prices + P&L, which two genuine round trips
 * on the same 0DTE contract share exactly. This screen was therefore pointing at real trades and
 * offering a bulk delete. The random-id duplicates are indistinguishable from real trades by any
 * means available here, so proposing their deletion was always a guess — a duplicate left on
 * screen is visible and annoying, a deleted trade is gone.
 *
 * The fingerprint still exists, and dedupeIncomingTrades still uses it, because recognising a row
 * ALREADY in the journal is a different and safer question than proposing to delete one: guessing
 * wrong there means one trade fails to import, not one destroyed.
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
  if (trade.tags?.length) score += 2;
  if (trade.setup?.trim()) score += 2;
  if (trade.grade) score += 2;
  if (trade.strategyId) score += 1;
  if (typeof trade.checklistScore === 'number') score += 1;
  return score;
}

/**
 * The cleanup's grouping key: the broker's own id for the fill, scoped to one journal.
 *
 * Only rows carrying a sourceId qualify — a manually-logged trade has no broker record behind it,
 * and two identical manual entries are something traders genuinely do.
 */
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
 * Returns the copies that should go, keeping exactly one of each real trade.
 *
 * The keeper is the most annotated copy; ties go to whichever was saved first, and then to
 * whichever came first in the list, so the answer is stable across runs and doesn't depend on
 * Firestore's document ordering.
 */
export function findDuplicateTrades(trades: Trade[]): DuplicateReport {
  const groups = new Map<string, { trade: Trade; index: number }[]>();

  // One rule, the provable one. See the fingerprint note at the top of this file for why the
  // broader grouping was taken out rather than kept as a fallback.
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

export interface DedupeResult<T extends Partial<Trade> = Partial<Trade>> {
  /**
   * Trades not already present in the journal, safe to import.
   *
   * Generic over the incoming type so that a caller carrying extra fields — the automatic importer
   * tags each pull with the brokerage account it came from — still has them on the way out. Erasing
   * them to Partial<Trade> is what forced that caller into a cast on the field it needed most.
   */
  fresh: T[];
  /** Already known — counted so the UI can say "you're up to date" rather than "found nothing". */
  alreadyKnown: number;
  /** Dropped because nothing about them could ever be recognised again. */
  unidentified: number;
}

/**
 * Decides which trades off a broker sync are actually new.
 *
 * The rules live here, in one place, deliberately. This app has shipped two copies of them before
 * — one that dropped rows with no sourceId and cross-checked an execution fingerprint, and one
 * that did neither and imported every row it could not match. Both ran against the same journal,
 * and a duplicated month of history is what that cost. Whichever copy is more careful, having two
 * means the careless one eventually runs.
 *
 * Two independent ways to recognise a trade, because one is not enough:
 *  - sourceId, the broker's id for the round trip. The normal path.
 *  - the execution fingerprint, for rows imported before the id bug was fixed. Their sourceIds
 *    carry a random component that will never match again, so a sourceId-only check would
 *    re-import every one of them on the first sync after the fix.
 *
 * A row with no sourceId at all is dropped rather than imported. Nothing about it can be matched
 * on the next sync, so importing it guarantees a fresh copy of that fill every time anyone presses
 * Sync — a duplicate for each attempt, indefinitely.
 */
export function dedupeIncomingTrades<T extends Partial<Trade>>(
  incoming: T[],
  existingTrades: Trade[],
  /** Carried across accounts in one run, so two accounts reporting the same round trip add it once. */
  seen: Set<string> = new Set(),
): DedupeResult<T> {
  for (const t of existingTrades) {
    if (t.sourceId) {
      seen.add(`id:${t.sourceId}`);
      seen.add(`fp:${executionFingerprint(t)}`);
    }
  }

  const fresh: T[] = [];
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

    /*
     * The id is remembered; the fingerprint is NOT.
     *
     * sourceId is unique per fill by construction — fallbackActivityId counts occurrences so
     * that two 100-share buys at the same price and time get different ids. The fingerprint is
     * not unique, and on a Schwab feed it is barely unique at all: with no fill times it reduces
     * to date + contract + size + prices + P&L, which two genuine round trips on the same 0DTE
     * contract share exactly.
     *
     * Adding it here let one incoming row suppress another, so the second real trade of an
     * identical pair was counted "already imported" and silently never arrived. The fingerprint
     * exists for one job only — recognising rows ALREADY in the journal whose sourceIds carry the
     * old Math.random() component and will never match again — and that job is done by the seed
     * above, from existingTrades.
     */
    seen.add(idKey);
    fresh.push(trade);
  }

  return { fresh, alreadyKnown, unidentified };
}
