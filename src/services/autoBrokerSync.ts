import type { Trade } from '../types';
import type { BrokerAccountSummary, BrokerStatus } from './brokerConnect';
import { dedupeIncomingTrades } from '../utils/duplicateTrades';

/**
 * Pulls new broker trades in the background when the journal is opened.
 *
 * Sync used to happen only when someone opened Connect Broker and tapped a button, while the
 * landing page promised trades "sync automatically" — so a user could trade all week, open the
 * app, and find nothing new. This closes that gap without a scheduler: the check runs on open,
 * at most once every SYNC_INTERVAL_MS, and does nothing at all if the user has no broker linked.
 *
 * Everything here is best-effort. A failed sync leaves the journal exactly as it was; it never
 * blocks rendering and never surfaces as an error the user has to dismiss, because they didn't
 * ask for it — they just opened their journal.
 */

/** How stale the data has to be before opening the app triggers a refresh. */
export const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Per-browser, per-user. Deliberately not stored in Firestore: syncing is idempotent (trades are
 * deduped on sourceId), so the cost of two devices each syncing once is a wasted API call, while
 * the cost of sharing one timestamp is that opening the app on your phone can be a no-op because
 * your laptop synced an hour ago — which is the opposite of what someone reaching for their phone
 * after the close wants.
 */
function lastSyncKey(uid: string): string {
  return `tc-last-broker-sync:${uid}`;
}

export function getLastSyncedAt(uid: string): number | null {
  try {
    const raw = localStorage.getItem(lastSyncKey(uid));
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function setLastSyncedAt(uid: string, at: number): void {
  try {
    localStorage.setItem(lastSyncKey(uid), String(at));
  } catch {
    // Storage unavailable — we'll just re-check on the next open, which is harmless.
  }
}

export function isSyncDue(uid: string, now = Date.now()): boolean {
  const last = getLastSyncedAt(uid);
  return last === null || now - last >= SYNC_INTERVAL_MS;
}

export interface AutoSyncResult {
  /** Trades that weren't already in the journal, ready to be saved. */
  newTrades: Trade[];
  /** Accounts we successfully reached. */
  syncedAccounts: number;
  /** Accounts that errored — the rest still counted. */
  failedAccounts: number;
}

type FetchStatusFn = () => Promise<BrokerStatus>;
type SyncAccountFn = (accountId: string) => Promise<{ trades: Partial<Trade>[] }>;

interface RunAutoSyncOptions {
  uid: string;
  existingTrades: Trade[];
  /** Injectable so this stays testable without a network layer — and so importing this module
   *  doesn't pull Firebase in for callers that only want the scheduling helpers. */
  fetchStatus?: FetchStatusFn;
  syncAccount?: SyncAccountFn;
}

/**
 * Syncs every connected account and returns the trades that are genuinely new.
 *
 * Returns null when there is nothing to do — no broker registered, or no accounts linked — so the
 * caller can tell "nothing happened" apart from "synced and found nothing", which matter
 * differently for what the UI should say.
 */
export async function runAutoSync({
  uid,
  existingTrades,
  fetchStatus,
  syncAccount,
}: RunAutoSyncOptions): Promise<AutoSyncResult | null> {
  // Loaded on demand rather than at module scope: brokerConnect reaches Firebase, and this
  // module's timing helpers are useful (and testable) without any of that.
  const api =
    fetchStatus && syncAccount ? null : await import('./brokerConnect');
  const getStatus: FetchStatusFn = fetchStatus ?? api!.fetchBrokerStatus;
  const doSync: SyncAccountFn = syncAccount ?? api!.syncBrokerAccount;

  const status = await getStatus();
  if (!status.registered || status.accounts.length === 0) {
    // Record the attempt anyway: a user with no broker shouldn't re-hit this endpoint on every
    // single app open just to be told the same thing.
    setLastSyncedAt(uid, Date.now());
    return null;
  }

  // Carried across accounts for the whole run, so two accounts reporting the same round trip
  // cannot both add it. Built from the journal as it was before this run.
  const seen = new Set<string>();
  const newTrades: Trade[] = [];
  let syncedAccounts = 0;
  let failedAccounts = 0;
  let unidentified = 0;

  for (const account of status.accounts as BrokerAccountSummary[]) {
    try {
      const { trades } = await doSync(account.id);
      syncedAccounts++;

      // One shared filter with the manual sync. This used to be a local sourceId check that
      // pushed every row it could not match, including rows with no sourceId at all — which on a
      // background sync means a fresh copy of that fill on every single app open.
      const { fresh, unidentified: skipped } = dedupeIncomingTrades(trades, existingTrades, seen);
      unidentified += skipped;

      for (const [i, trade] of fresh.entries()) {
        newTrades.push({
          ...trade,
          id: `snaptrade_${account.id}_${Date.now()}_${i}`,
        } as Trade);
      }
    } catch {
      // One broker being down shouldn't cost the user their other accounts' trades.
      failedAccounts++;
    }
  }

  if (unidentified > 0) {
    console.warn(`[auto-sync] skipped ${unidentified} trade(s) with no source id.`);
  }

  // Only counts as "synced" if at least one account actually answered — otherwise a total outage
  // would silently start a four-hour cooldown on retrying.
  if (syncedAccounts > 0) setLastSyncedAt(uid, Date.now());

  return { newTrades, syncedAccounts, failedAccounts };
}
