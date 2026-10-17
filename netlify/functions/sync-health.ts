import { schedule, type Handler } from '@netlify/functions';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import { logServerError } from '../../server/errorReports';
import { readJournalEvents } from '../../server/journalEvents';
import { assessSyncHealth, syncHealthMessage, type ConnectedAccount } from '../../server/syncHealth';
import { adminMessageEmail } from '../../server/emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';
import { usageDay } from '../../server/usage';
import type { JournalEvent } from '../../src/utils/journalEvents';

/**
 * The check on the morning import, two hours after it.
 *
 * auto-sync fires at 11:00 UTC. By 13:00 every user it was going to reach has been reached, and
 * their history rows are in. This reads those rows for everyone the broker mirror believes is
 * connected, judges them (server/syncHealth.ts), and emails the owner only when something is
 * wrong — a daily "all fine" is a mail that gets filtered, and then the one that matters goes
 * with it. The all-fine summary goes to the function log instead.
 */
async function run(): Promise<{ ok: boolean; problems: string[]; emailed: boolean }> {
  const db = getAdminFirestore();
  const today = usageDay();

  const mirror = await db.collection('brokerConnections').where('connected', '==', true).get();
  const connected: ConnectedAccount[] = [];
  for (const doc of mirror.docs) {
    const ranOn = (doc.data() as { autoSyncRanOn?: string }).autoSyncRanOn ?? null;
    // Only a user stamped today has rows worth reading; everyone else contributes to the count.
    const rows: JournalEvent[] = ranOn === today ? await readJournalEvents(doc.id, 10) : [];
    connected.push({
      uid: doc.id,
      autoSyncRanOn: ranOn,
      today: rows
        .filter((e) => e.type === 'sync' && e.sync?.automatic && e.at.slice(0, 10) === today)
        .map((e) => e.sync!),
    });
  }

  const health = assessSyncHealth(connected, today);
  const { subject, message } = syncHealthMessage(health, today);
  console.log(`[sync-health] ${subject}: ${JSON.stringify(health.summary)}`);

  if (health.ok || !isMailConfigured()) return { ok: health.ok, problems: health.problems, emailed: false };

  // The owner, from the same document that decides who the admin is.
  const adminUid = ((await db.doc('config/admin').get()).data() as { uid?: string } | undefined)?.uid;
  const to = adminUid ? (await getAdminAuth().getUser(adminUid)).email : undefined;
  if (!to) {
    console.warn('[sync-health] problems found but no admin address to send them to');
    return { ok: false, problems: health.problems, emailed: false };
  }

  const email = adminMessageEmail({ subject, message, siteUrl: siteUrl() });
  const outcome = await sendEmail({ to, ...email, tag: 'sync-health' });
  return { ok: false, problems: health.problems, emailed: outcome.sent };
}

const syncHealthHandler: Handler = async () => {
  try {
    const result = await run();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    await logServerError('sync-health', err, {});
    console.error('[sync-health] failed:', err);
    return { statusCode: 500, body: 'sync-health failed' };
  }
};

// Two hours after auto-sync's '0 11 * * 2-6', on the same days.
export const handler = schedule('0 13 * * 2-6', syncHealthHandler);
