import { schedule, type Handler } from '@netlify/functions';
import { FieldPath } from 'firebase-admin/firestore';
import type { Trade } from '../../src/types';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import { effectiveTier, readEntitlement } from '../../server/entitlements';
import { logServerError } from '../../server/errorReports';
import { pullRecentActivityForUser } from '../../server/brokerConnectHandler';
import { recordJournalEvent } from '../../server/journalEvents';
import { brokerTradeIdPrefix } from '../../src/utils/brokerTradeIds';
import { recordAutomatic, usageDay } from '../../server/usage';
import { dedupeIncomingTrades } from '../../src/utils/duplicateTrades';
import {
  accountsPerRun,
  autoSyncTradeId,
  chunkForWrite,
  journalForAccount,
  journalForImports,
  lookbackStart,
  runAutoSync,
  type AutoSyncSummary,
} from '../../server/autoSync';

/**
 * Diamond's automatic morning import.
 *
 * Runs Tuesday to Saturday at 11:00 UTC — six or seven in the morning Eastern, after a US session
 * has closed and before the trader opens the app. Saturday is what catches Friday; Sunday and
 * Monday are skipped because nothing traded and there is nothing new to find.
 *
 * A day behind is not a bug here, it is SnapTrade: transactions are cached and delivered one day
 * late on every plan they sell. Running this hourly would return the same rows every time.
 *
 * The decision logic is in server/autoSync.ts and tested there. This file is the plumbing: who to
 * ask, how to write, and how to say what happened.
 */

/** Set to decide and log without pulling anything. */
function isDryRun(): boolean {
  return process.env.AUTO_SYNC_DRY_RUN === 'true';
}

/**
 * Everything already in the journal that a new import could duplicate.
 *
 * Only as far back as the pull reached — reading a whole journal to dedupe ten days of fills would
 * be the most expensive part of this job. The exception is a pull that read everything (an account
 * with no trusted sync state yet), which can return trades from any date; then the whole journal is
 * the only honest comparison, once.
 */
async function recentTrades(uid: string, since: string | undefined): Promise<Trade[]> {
  const trades = getAdminFirestore().collection(`users/${uid}/trades`);
  const snap = await (since === undefined ? trades : trades.where('date', '>=', since)).get();
  return snap.docs.map((doc) => ({ ...(doc.data() as Trade), id: doc.id }));
}

/**
 * The trades ONE brokerage account has imported, to learn which journal it belongs in.
 *
 * By document id, which is where the account survives: every importer writes
 * `snaptrade_<account>_…`, so a range over that prefix is that account's trades and nothing else.
 * A single-field order on the document id needs no composite index.
 */
async function journalCandidatesFor(uid: string, snaptradeAccountId: string): Promise<Trade[]> {
  const prefix = brokerTradeIdPrefix(snaptradeAccountId);
  const snap = await getAdminFirestore()
    .collection(`users/${uid}/trades`)
    .orderBy(FieldPath.documentId())
    .startAt(prefix)
    .endAt(`${prefix}\uf8ff`)
    .limit(JOURNAL_LOOKUP_LIMIT)
    .get();

  return snap.docs.map((doc) => ({ ...(doc.data() as Trade), id: doc.id }));
}

/**
 * The newest trades in the journal, whatever their date — only to decide which journal to file into.
 *
 * journalForImports picks the journal the trader last imported broker trades into, and it was being
 * handed the ten-day dedupe window. Anyone who had not traded for a fortnight therefore had no broker
 * trade in that list at all, so it fell through to the ACTIVE journal — and the comment on that
 * fallback names the exact harm: "someone who left a paper-trading journal selected would find real
 * fills in it". A holiday was enough to trigger it.
 *
 * Fifty is plenty: the question is only which journal the most recent broker import went to, and the
 * answer is in the first row that has a sourceId. Sorting by date descending means a reader of the
 * whole journal is never needed.
 */
const JOURNAL_LOOKUP_LIMIT = 50;

async function journalCandidates(uid: string): Promise<Trade[]> {
  const snap = await getAdminFirestore()
    .collection(`users/${uid}/trades`)
    .orderBy('date', 'desc')
    .limit(JOURNAL_LOOKUP_LIMIT)
    .get();

  return snap.docs.map((doc) => ({ ...(doc.data() as Trade), id: doc.id }));
}

async function importFor(uid: string, activeAccountId: string, today: string) {
  const since = lookbackStart(today);
  const { accounts, trades, pulls, skippedAccounts, historyLoading, truncated, perAccount, earliestStart } =
    await pullRecentActivityForUser(uid, since, accountsPerRun());
  if (skippedAccounts > 0) {
    console.info(
      `[auto-sync] ${uid}: refreshed ${pulls} of ${accounts} accounts; ${skippedAccounts} left for a manual sync.`,
    );
  }
  if (historyLoading > 0) {
    // A connection made overnight whose history SnapTrade has not finished loading. Nothing to
    // pull yet and nothing written to the trader's history; the next run picks it up.
    console.info(`[auto-sync] ${uid}: ${historyLoading} account(s) still loading history at SnapTrade; skipped.`);
  }
  if (truncated) {
    // An account past the page cap. Said out loud, because the alternative — what this used to do —
    // is a morning import that quietly covers less of the window than it claims to.
    console.warn(
      `[auto-sync] ${uid}: an account returned more activity than one run pages through; the oldest of the window needs a manual sync.`,
    );
  }

  // Recorded whatever comes back, including nothing. The pulls are free — SnapTrade meters a
  // manual holdings refresh, not a read — so this is a count of what the product did on somebody's
  // behalf rather than a bill. Worth keeping either way: "the morning import ran and found
  // nothing" and "the morning import never ran" are different problems.
  await recordAutomatic('sync', uid, pulls);

  const existing = trades.length > 0 ? await recentTrades(uid, earliestStart) : [];
  const { fresh } = dedupeIncomingTrades(trades, existing);

  /*
   * One history row per account, written whatever came back — including nothing.
   *
   * The morning import wrote no history at all, so the one person it ran for could not tell "it
   * found nothing" from "it never ran", and Diamond's headline feature was a black box with a
   * switch on it. The same rows the manual sync writes, marked automatic, with how many were new.
   */
  const at = new Date().toISOString();
  const freshByAccount = new Map<string, number>();
  for (const t of fresh) freshByAccount.set(t.snaptradeAccountId, (freshByAccount.get(t.snaptradeAccountId) ?? 0) + 1);
  for (const a of perAccount) {
    await recordJournalEvent(uid, {
      type: 'sync',
      at,
      sync: { ...a, automatic: true, fresh: freshByAccount.get(a.accountId) ?? 0 },
    });
  }

  if (fresh.length === 0) return { imported: 0, accounts };

  /*
   * A journal per brokerage account, not one for the run.
   *
   * Each account goes where it last imported. An account that has never imported falls back to the
   * trader-wide answer — the journal the last broker import of any kind went to, else the active
   * one — asked of the newest trades rather than of the dedupe window, which may be only days wide.
   */
  const fallback = journalForImports(await journalCandidates(uid), activeAccountId);
  const journalByAccount = new Map<string, string>();
  for (const accountId of new Set(fresh.map((t) => t.snaptradeAccountId))) {
    journalByAccount.set(accountId, journalForAccount(await journalCandidatesFor(uid, accountId), accountId, fallback));
  }

  const db = getAdminFirestore();
  const stamp = Date.now();
  const savedAt = new Date().toISOString();

  /*
   * Chunked, because one batch takes 500 writes and this used to use exactly one.
   *
   * Ten days of an active 0DTE account is more than 500 round trips, and the first automatic run
   * after connecting or after a journal clear has the whole window to write. The commit threw, the
   * import failed, and since markRun only runs on success the window widened and the next morning
   * failed harder — Diamond's headline feature doing nothing, silently, for good.
   */
  let written = 0;
  for (const group of chunkForWrite(fresh)) {
    const batch = db.batch();
    group.forEach((trade, i) => {
      /*
       * The same id scheme the manual importer writes.
       *
       * The brokerage account survives onto a trade only in this prefix — accountId is the journal —
       * and syncWindow reads it to decide how far back the manual Sync button has to ask for. The old
       * `autosync_` ids were unreadable to that check, so an auto-syncing trader's manual sync pulled
       * their entire history every time.
       *
       * The tag itself is destructured off rather than stored: the id now carries it, and a field
       * that is not in the Trade type is a field nothing will ever read.
       */
      const { snaptradeAccountId, ...fields } = trade;
      const id = autoSyncTradeId(snaptradeAccountId, stamp, written + i);
      batch.set(db.doc(`users/${uid}/trades/${id}`), {
        ...fields,
        id,
        accountId: fields.accountId ?? journalByAccount.get(snaptradeAccountId) ?? fallback,
        savedAt,
      });
    });
    await batch.commit();
    written += group.length;
  }

  return { imported: fresh.length, accounts };
}

async function run(): Promise<AutoSyncSummary> {
  const db = getAdminFirestore();
  const today = usageDay();

  return runAutoSync({
    today,
    dryRun: isDryRun(),

    // The same mirror the reaper reads, for the same reason: it is the population that actually
    // has a connection, and it goes stale in the useful direction.
    listConnected: async () => {
      const snap = await db.collection('brokerConnections').where('connected', '==', true).get();
      return snap.docs.map((doc) => ({
        uid: doc.id,
        lastRunDate: (doc.data() as { autoSyncRanOn?: string }).autoSyncRanOn ?? null,
      }));
    },

    // The effective tier, so a complimentary Diamond grant imports like a purchased one.
    resolveTier: async (uid) => effectiveTier(await readEntitlement(uid), Date.now()),

    readPreferences: async (uid) => {
      const snap = await db.doc(`users/${uid}/settings/preferences`).get();
      const data = (snap.data() ?? {}) as { autoSyncEnabled?: unknown; activeAccountId?: unknown };
      return {
        // Absent means on. The default in DEFAULT_SETTINGS is true, and an account that has never
        // opened Settings has no field written — reading that as "off" would switch the feature
        // off for everybody who has not touched it, which is everybody.
        enabled: data.autoSyncEnabled !== false,
        activeAccountId: typeof data.activeAccountId === 'string' ? data.activeAccountId : 'default',
      };
    },

    importFor: (uid, activeAccountId) => importFor(uid, activeAccountId, today),

    reportFailure: async (uid, err) => {
      await logServerError('auto-sync', err, { uid });
    },

    markRun: async (uid, day, imported) => {
      await db.collection('brokerConnections').doc(uid).set(
        {
          autoSyncRanOn: day,
          autoSyncLastImported: imported,
          autoSyncLastRunAt: new Date().toISOString(),
        },
        { merge: true },
      );
    },
  });
}

const autoSyncHandler: Handler = async () => {
  try {
    const summary = await run();
    console.log(
      `[auto-sync] ${summary.ran} run, ${summary.imported} trade(s) imported, ` +
        `${summary.failed} failed, skipped ${JSON.stringify(summary.skipped)}` +
        (isDryRun() ? ' (dry run)' : ''),
    );
    for (const outcome of summary.outcomes) {
      if (outcome.error) console.warn(`[auto-sync] ${outcome.uid}: ${outcome.error}`);
    }
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (err) {
    // One thrown error here is every Diamond user's morning import, silently, so it is reported
    // rather than left in a log nobody reads.
    await logServerError('auto-sync', err, {});
    console.error('[auto-sync] run failed:', err);
    return { statusCode: 500, body: 'auto-sync failed' };
  }
};

export const handler = schedule('0 11 * * 2-6', autoSyncHandler);
