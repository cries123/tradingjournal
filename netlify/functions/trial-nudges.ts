import { schedule, type Handler } from '@netlify/functions';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import { readEntitlement } from '../../server/entitlements';
import { logServerError } from '../../server/errorReports';
import { trialEmail, type TrialProgress } from '../../server/emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';
import { decideNudge, nudgeKey } from '../../server/trialNudges';
import { TIER_PLANS } from '../../src/config/tiers';

/**
 * The three notes a trial gets while it runs.
 *
 * A trial with no reminders converts badly: it starts, a week goes by, and the first thing the
 * person hears from us is that their broker connection is being removed. Each of these has a job
 * — get them to connect, show them what it did, say when it stops — and none of them is a sales
 * pitch, because somebody who watched a month of trades import already knows what it is worth.
 */

/** A ceiling on one run. Past this the rest go tomorrow, which for a daily job is fine. */
const MAX_PER_RUN = 200;

/** How far a trial's imports are counted from. Generous: a trial is at most a week or two. */
const LOOKBACK_DAYS = 30;

async function progressFor(uid: string, since: string): Promise<TrialProgress> {
  const db = getAdminFirestore();

  const [connection, trades] = await Promise.all([
    db.doc(`brokerConnections/${uid}`).get(),
    db
      .collection(`users/${uid}/trades`)
      .where('savedAt', '>=', since)
      .limit(2000)
      .get()
      .catch(() => null),
  ]);

  const imported = trades
    ? trades.docs.filter((d) => Boolean((d.data() as { accountId?: string }).accountId)).length
    : 0;

  return {
    connected: (connection.data() as { connected?: boolean } | undefined)?.connected === true,
    imported,
  };
}

async function run(): Promise<{ considered: number; sent: number; skipped: number }> {
  const stats = { considered: 0, sent: 0, skipped: 0 };
  if (!isMailConfigured()) {
    console.info('[trial-nudges] no mail provider configured — nothing to do');
    return stats;
  }

  const db = getAdminFirestore();
  const now = Date.now();

  /*
   * Everyone whose trial has not ended yet.
   *
   * A range on one field rides Firestore's automatic single-field index, so this needs nothing
   * built by hand in the console. It returns hand-granted comps too; decideNudge drops those,
   * because a gift is not a trial and should not be counted down at somebody.
   */
  const live = await db
    .collection('entitlements')
    .where('comp.until', '>=', new Date(now).toISOString())
    .limit(MAX_PER_RUN)
    .get();

  for (const doc of live.docs) {
    stats.considered += 1;
    const uid = doc.id;

    try {
      const entitlement = await readEntitlement(uid);
      const sent = (doc.data() as { trialNudges?: Record<string, string> }).trialNudges ?? {};
      const decision = decideNudge({ entitlement, sent, now });
      if (!decision.send) {
        stats.skipped += 1;
        continue;
      }

      const account = await getAdminAuth().getUser(uid);
      if (!account.email) {
        stats.skipped += 1;
        continue;
      }

      const since = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString();
      const mail = trialEmail({
        stage: decision.stage,
        daysLeft: decision.daysLeft,
        tierName: TIER_PLANS[entitlement?.comp?.tier ?? 'silver'].name,
        progress: await progressFor(uid, since),
        siteUrl: siteUrl(),
      });

      const outcome = await sendEmail({ to: account.email, ...mail, tag: `trial-${decision.stage}` });
      if (!outcome.sent) {
        stats.skipped += 1;
        continue;
      }

      // Recorded only after it actually went, so a provider outage means it is tried again
      // tomorrow rather than silently skipped for the rest of the trial.
      await doc.ref.set(
        { trialNudges: { ...sent, [nudgeKey(decision.stage, decision.endsAt)]: new Date(now).toISOString() } },
        { merge: true },
      );
      stats.sent += 1;
    } catch (err) {
      stats.skipped += 1;
      console.error(`[trial-nudges] skipped ${uid}:`, err);
    }
  }

  console.info(
    `[trial-nudges] considered=${stats.considered} sent=${stats.sent} skipped=${stats.skipped}`,
  );
  return stats;
}

const nudgeHandler: Handler = async () => {
  try {
    return { statusCode: 200, body: JSON.stringify(await run()) };
  } catch (err) {
    console.error('[trial-nudges] run failed:', err);
    logServerError('trial-nudges', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Nudge run failed' }) };
  }
};

// 15:00 UTC — late morning US Eastern, when somebody is more likely to act on it than at dawn.
export const handler = schedule('0 15 * * *', nudgeHandler);
