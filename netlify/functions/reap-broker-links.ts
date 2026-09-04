import { schedule, type Handler } from '@netlify/functions';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import { readEntitlement } from '../../server/entitlements';
import { resetBrokerLink } from '../../server/adminAccountActions';
import { logServerError } from '../../server/errorReports';
import { brokerLinkEndingEmail, brokerLinkRemovedEmail } from '../../server/emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';
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

/** The brokerage this account linked, for an email that can name it. Null when unrecorded. */
async function institutionFor(uid: string): Promise<string | null> {
  const snap = await getAdminFirestore().doc(`brokerConnections/${uid}`).get();
  const names = (snap.data() as { institutions?: unknown } | undefined)?.institutions;
  return Array.isArray(names) && typeof names[0] === 'string' && names[0] ? names[0] : null;
}

async function emailFor(uid: string): Promise<string | null> {
  try {
    return (await getAdminAuth().getUser(uid)).email ?? null;
  } catch {
    // Deleted from Auth but still holding a connection — reap it, just quietly.
    return null;
  }
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
      return snap.docs.map((doc) => {
        const data = doc.data() as { unentitledSince?: string; reapWarnedAt?: string };
        return {
          uid: doc.id,
          unentitledSince: data.unentitledSince ?? null,
          warnedAt: data.reapWarnedAt ?? null,
        };
      });
    },

    readEntitlement,

    // resetBrokerLink, not deleteConnection: removing the SnapTrade user is what ends the per-user
    // charge, and it leaves the account able to register again cleanly. Trades are not touched.
    removeLink: async (uid) => {
      await resetBrokerLink(uid);
    },

    markUnentitledSince: async (uid, at) => {
      await db.collection('brokerConnections').doc(uid).set({ unentitledSince: at }, { merge: true });
    },

    markWarned: async (uid, at) => {
      await db.collection('brokerConnections').doc(uid).set({ reapWarnedAt: at }, { merge: true });
    },

    /*
     * Returning true clears the account for removal on a later run.
     *
     * No mail provider returns true as well: an install without RESEND_API_KEY would otherwise
     * never reap anything, and every lapsed connection would bill indefinitely because the notice
     * it was waiting on could never be sent.
     */
    warn: async (uid, removesOn) => {
      if (!isMailConfigured()) return true;
      const to = await emailFor(uid);
      if (!to) return true;

      const mail = brokerLinkEndingEmail({
        institution: await institutionFor(uid),
        removesOn,
        siteUrl: siteUrl(),
      });
      const outcome = await sendEmail({ to, ...mail, tag: 'broker-link-ending' });
      // A refused address is never going to work; waiting on it forever just keeps the meter
      // running. A provider error might be temporary, so that one is worth another day.
      return outcome.sent || outcome.reason === 'invalid-recipient';
    },

    notifyRemoved: async (uid) => {
      if (!isMailConfigured()) return;
      const to = await emailFor(uid);
      if (!to) return;

      const mail = brokerLinkRemovedEmail({
        institution: await institutionFor(uid),
        siteUrl: siteUrl(),
      });
      await sendEmail({ to, ...mail, tag: 'broker-link-removed' });
    },
  });

  console.info(
    `[reap-broker-links] considered=${summary.considered} reaped=${summary.reaped} ` +
      `warned=${summary.warned} waiting=${summary.waiting} kept=${summary.kept} failed=${summary.failed}` +
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
