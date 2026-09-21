import { getAdminFirestore } from './firebaseAdmin';
import type { Trade } from '../src/types';
import { resolveTradeAccountId } from '../src/utils/accounts';
import { isBrokerVerified } from '../src/utils/trackRecord';
import { effectivePnl } from '../src/utils/tradeHelpers';

/**
 * Somebody else's journal, read-only, for support.
 *
 * READ-ONLY ON PURPOSE, and not an impersonation. Minting a token and signing in as a customer
 * would mean every write is attributed to them — a plan cancelled, a trade edited or a journal
 * cleared would appear in their own history as something they did, and nobody could tell
 * afterwards which it was. This returns what they would see and offers no way to change it.
 *
 * Nothing here is newly exposed: firestore.rules already lets an admin read users/{uid}/trades
 * and users/{uid}/settings. This assembles it into the answer a support thread needs instead of
 * making somebody reconstruct it from the console.
 */

/** Recent trades returned per request. Enough to see what the last syncs produced. */
const RECENT_TRADES = 50;

export interface JournalSnapshotRow {
  id: string;
  date: string;
  symbol: string;
  pnl: number;
  /** Which journal it sits in, resolved the same way the app resolves it. */
  accountId: string;
  /** True when it came from a broker import rather than being typed in. */
  fromBroker: boolean;
  /** When it was last written. The field that shows a sync re-saving rows it already had. */
  savedAt: string | null;
}

export interface JournalCount {
  accountId: string;
  /** Name from their settings, or null when the journal no longer exists. */
  name: string | null;
  trades: number;
  fromBroker: number;
  handEntered: number;
  netPnl: number;
}

export interface UserJournalSnapshot {
  activeAccountId: string | null;
  /** Every journal holding trades, including ones deleted out from under them. */
  journals: JournalCount[];
  totalTrades: number;
  /** Their configured limits, as the app would apply them. */
  rules: Record<string, unknown> | null;
  recent: JournalSnapshotRow[];
}

function toRow(id: string, trade: Trade): JournalSnapshotRow {
  const savedAt = (trade as { savedAt?: unknown }).savedAt;

  return {
    id,
    date: trade.date ?? '',
    symbol: trade.symbol ?? '',
    pnl: Math.round(effectivePnl(trade) * 100) / 100,
    accountId: resolveTradeAccountId(trade.accountId),
    fromBroker: isBrokerVerified(trade),
    savedAt: typeof savedAt === 'string' ? savedAt : null,
  };
}

export async function readUserJournal(uid: string): Promise<UserJournalSnapshot> {
  const db = getAdminFirestore();

  const [tradesSnap, settingsSnap] = await Promise.all([
    db.collection(`users/${uid}/trades`).limit(20_000).get(),
    db.doc(`users/${uid}/settings/preferences`).get(),
  ]);

  const settings = settingsSnap.exists
    ? (settingsSnap.data() as {
        accounts?: { id: string; name: string }[];
        activeAccountId?: string;
        tradingRules?: Record<string, unknown>;
      })
    : undefined;

  const names = new Map((settings?.accounts ?? []).map((a) => [a.id, a.name]));

  const rows = tradesSnap.docs.map((d) => toRow(d.id, d.data() as Trade));

  const grouped = new Map<string, JournalCount>();
  for (const row of rows) {
    const existing = grouped.get(row.accountId) ?? {
      accountId: row.accountId,
      name: names.get(row.accountId) ?? null,
      trades: 0,
      fromBroker: 0,
      handEntered: 0,
      netPnl: 0,
    };

    existing.trades += 1;
    if (row.fromBroker) existing.fromBroker += 1;
    else existing.handEntered += 1;
    existing.netPnl = Math.round((existing.netPnl + row.pnl) * 100) / 100;

    grouped.set(row.accountId, existing);
  }

  /*
   * Sorted by savedAt, not by trade date.
   *
   * "What did their last sync write" is the question, and a sync imports history — a trade dated
   * three months ago can be the newest thing in the account. Ordering by the trading date would
   * bury exactly the rows somebody is looking for.
   */
  const recent = [...rows]
    .sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''))
    .slice(0, RECENT_TRADES);

  return {
    activeAccountId: settings?.activeAccountId ?? null,
    journals: [...grouped.values()].sort((a, b) => b.trades - a.trades),
    totalTrades: rows.length,
    rules: settings?.tradingRules ?? null,
    recent,
  };
}
