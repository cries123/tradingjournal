/**
 * The document id of a broker-imported trade, in one place.
 *
 * The brokerage account survives onto a trade ONLY in this id — `accountId` is the journal it was
 * filed into — and syncWindow reads it to decide how far back the next sync has to ask for. Three
 * things used to agree on the shape by convention: the manual importer wrote it, the automatic
 * importer wrote its own variant, and the window read it. Convention is what failed: addTrades
 * replaced the manual importer's id with a random UUID before the write, so the window never
 * matched a manual trade and every manual sync pulled the whole history. Nothing noticed, because
 * each end was tested against its own idea of the shape.
 *
 * Now every writer builds from the one prefix, and the one reader checks it. A test asserts that
 * both writers' ids satisfy the reader.
 */

export function brokerTradeIdPrefix(snaptradeAccountId: string): string {
  return `snaptrade_${snaptradeAccountId}_`;
}

/**
 * The index is ZERO-PADDED, because this id is also the import sequence.
 *
 * Firestore returns a collection with no orderBy in document-id order, which is lexicographic, and
 * the trade list is then sorted by date alone — a stable sort, so within a day the id order is what
 * survives. Unpadded, `_10` sorts before `_2`, so any day with eleven or more trades replayed in the
 * wrong order — exactly the busy days the rule simulator and the tilt panel draw conclusions from.
 * Four digits covers a day no 0DTE trader will reach.
 */
function sequence(index: number): string {
  return String(index).padStart(4, '0');
}

/** What the Sync button writes. The stamp is the sync's Date.now(). */
export function manualSyncTradeId(snaptradeAccountId: string, stamp: number, index: number): string {
  return `${brokerTradeIdPrefix(snaptradeAccountId)}${stamp}_${sequence(index)}`;
}

/**
 * What the morning import writes. `auto` sits after the prefix the reader needs, so the provenance
 * stays legible in the id without breaking the match.
 */
export function autoSyncTradeId(snaptradeAccountId: string, stamp: number, index: number): string {
  return `${brokerTradeIdPrefix(snaptradeAccountId)}auto${stamp}_${sequence(index)}`;
}

/** True when this trade was imported from the given brokerage account, by either importer. */
export function isBrokerTradeIdFor(id: unknown, snaptradeAccountId: string): boolean {
  return typeof id === 'string' && id.startsWith(brokerTradeIdPrefix(snaptradeAccountId));
}
