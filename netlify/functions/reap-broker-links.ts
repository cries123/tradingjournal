import { schedule, type Handler } from '@netlify/functions';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import { readEntitlement } from '../../server/entitlements';
import { resetBrokerLink } from '../../server/adminAccountActions';
import { logServerError } from '../../server/errorReports';
import { runReap, DEFAULT_GRACE_DAYS, type ReapSummary } from '../../server/brokerReaper';

/**
 * Takes back broker links from accounts that no longer include broker sync.
 *
 * SnapTrade charges per person who has a connection, syncing or not. Losing a plan stops the sync
 * button working but has never removed the connection, so a lapsed trial or a cancelled
 * subscription left a live link and a standing monthly charge — indefinitely, because people
 * churn by never coming back rather than by pressing Disconnect.
 *
 * Nobody is reaped the moment their plan lapses. The grace period is there for the person who
 * subscribes three days later, who should not have to relink to get their journal syncing again.
 */

/** Override for a tighter or looser grace period without a deploy. */
function graceDays(): number {
  const raw = Number(process.env.BROKER_GRACE_DAYS);
  return Number.isInteger(raw) && raw >= 0 && raw <= 60 ? raw : DEFAULT_GRACE_DAYS;
}

/** Set to decide and log without removing anything — for looking before leaping. */
function isDryRun(): boolean {
  return process.env.BROKER_REAP_DRY_RUN === 'true';
}

async function reap(): Promise<ReapSummary> {
  const db = getAdminFirestore();

  const summary = await runReap({
    graceDays: graceDays(),
    dryRun: isDryRun(),

    // brokerConnections is the mirror the broker functions keep of who actually has a link. It is
    // the right list precisely because it goes stale in the useful direction: an account that
    // stopped opening the app keeps its last known state, which is the population being billed for.
    listConnected: async () => {
      const snap = await db.collection('brokerConnections').where('connected', '==', true).get();
      return snap.docs.map((doc) => ({
        uid: doc.id,
        unentitledSince: (doc.data() as { unentitledSince?: string }).unentitledSince ?? null,
      }));
    },

    readEntitlement,

    // resetBrokerLink, not deleteConnection: removing the SnapTrade user is what ends the per-user
    // charge, and it leaves the account able to register again cleanly. Trades are not touched.
    removeLink: async (uid) => {
      await resetBrokerLink(uid);
    },

    markUnentitledSince: async (uid, at) => {
      await db
        .collection('brokerConnections')
        .doc(uid)
        .set({ unentitledSince: at }, { merge: true });
    },
  });

  console.info(
    `[reap-broker-links] considered=${summary.considered} reaped=${summary.reaped} ` +
      `waiting=${summary.waiting} kept=${summary.kept} failed=${summary.failed}` +
      (summary.dryRun ? ' (dry run — nothing was removed)' : ''),
  );
  for (const row of summary.details) {
    console.info(`[reap-broker-links] removed ${row.uid}: ${row.reason}, lapsed ${row.lapsedAt}`);
  }

  return summary;
}

const reapHandler: Handler = async () => {
  try {
    return { statusCode: 200, body: JSON.stringify(await reap()) };
  } catch (err) {
    console.error('[reap-broker-links] run failed:', err);
    logServerError('reap-broker-links', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Reap run failed' }) };
  }
};

// 09:00 UTC daily — early morning US Eastern, well away from market hours, so a link that goes
// never goes in the middle of somebody's session. Netlify evaluates cron in UTC.
export const handler = schedule('0 9 * * *', reapHandler);
