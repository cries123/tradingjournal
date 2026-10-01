import { schedule, type Handler } from '@netlify/functions';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import { readEntitlement } from '../../server/entitlements';
import { logServerError } from '../../server/errorReports';
import { trialEmail, type TrialProgress } from '../../server/emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';
import { decideNudge, nudgeKey } from '../../server/trialNudges';
import { unsubscribeUrl } from '../../server/unsubscribeToken';
import { TRIAL_DAYS, TRIAL_TIER } from '../../src/config/trial';
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

/**
 * Whether they have unsubscribed from the welcome note.
 *
 * Absent means IN, which is the answer both other mailing jobs give — the recap reads a stored
 * `false` as "said no, explicitly" and the rule alerts treat a missing field as on. Reading absent
 * as OUT would silence the sequence for every account that has never opened Settings, which is
 * almost all of them, and the run log would call it `skipped` rather than an error.
 */
async function optedOut(uid: string): Promise<boolean> {
  const snap = await getAdminFirestore().doc(`emailPrefs/${uid}`).get();
  return (snap.data() as { trial?: unknown } | undefined)?.trial === false;
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
   * trialEndsAt, written by the Creem webhook on a trialing event. This used to read comp.until —
   * the complimentary grant written by a self-serve trial endpoint that nothing ever called — so
   * the query matched only hand-granted comps, decideNudge then dropped every one of those because
   * a gift is not a trial, and the whole sequence had never sent an email to anybody.
   *
   * A range on one field rides Firestore's automatic single-field index, so this needs nothing
   * built by hand in the console, and documents without the field are excluded for free.
   */
  const live = await db
    .collection('entitlements')
    .where('trialEndsAt', '>=', new Date(now).toISOString())
    .limit(MAX_PER_RUN)
    .get();

  for (const doc of live.docs) {
    stats.considered += 1;
    const uid = doc.id;

    try {
      const entitlement = await readEntitlement(uid);
      const sent = (doc.data() as { trialNudges?: Record<string, string> }).trialNudges ?? {};
      const decision = decideNudge({ entitlement, sent, optedOut: await optedOut(uid), now });
      if (!decision.send) {
        stats.skipped += 1;
        continue;
      }

      const account = await getAdminAuth().getUser(uid);
      if (!account.email) {
        stats.skipped += 1;
        continue;
      }

      /*
       * A plan that costs nothing has no charge to warn about.
       *
       * Reachable: an admin granting Free to somebody mid-trial leaves status active, so the trial
       * is still live and the email would read 'the card you used at checkout is charged $0 and
       * Free carries on month to month'. Silence beats an absurd promise on the one day it matters,
       * and the line says which account to look at.
       */
      const plan = entitlement?.tier ?? TRIAL_TIER;
      if (TIER_PLANS[plan].price <= 0) {
        console.warn(`[trial-nudges] ${uid} is mid-trial on ${plan}, which costs nothing — no note sent`);
        stats.skipped += 1;
        continue;
      }

      /*
       * A countdown longer than the trial can run means the date did not come from a trial period.
       * src/config/trial.ts says outright that nothing in this codebase can detect TRIAL_DAYS
       * disagreeing with the Creem product; this is the one place it shows up, so it gets a line
       * rather than going out as a wrong date.
       */
      if (decision.daysLeft > TRIAL_DAYS + 1) {
        console.warn(
          `[trial-nudges] ${uid} has ${decision.daysLeft} days left on a ${TRIAL_DAYS}-day trial — check the Creem product's trial length`,
        );
      }

      const since = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString();
      const mail = trialEmail({
        stage: decision.stage,
        daysLeft: decision.daysLeft,
        endsAt: decision.endsAt,
        sentAt: new Date(now).toISOString(),
        willCharge: decision.willCharge,
        // The tier itself: the template needs the price as well as the name, and reading both from
        // tiers.ts is what stops the two disagreeing the way they did. The fallback is TRIAL_TIER
        // rather than a 'silver' literal for the same reason — a literal here would have survived
        // the trial moving tiers and gone on quoting Silver's price to everybody.
        tier: plan,
        progress: await progressFor(uid, since),
        siteUrl: siteUrl(),
        // Only the welcome gets a link; the other two are notices about a charge. decideNudge has
        // already refused to send a welcome to somebody who used it.
        unsubscribeUrl:
          decision.stage === 'started' ? unsubscribeUrl(siteUrl(), uid, 'trial') : null,
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

  /*
   * A run that matched nobody is logged differently from a run that did.
   *
   * Those two outcomes used to print the same line, and the whole feature rests on an assumption no
   * file in this repo can prove: that Creem sends a signal containing the word "trialing" for this
   * product. If it does not, trialEndsAt is never written, this query matches nothing, and the
   * emails stay silent for ever with `considered=0` reading exactly like a quiet week. One grep for
   * this line answers "has a trial ever been seen" without opening the Creem dashboard.
   */
  if (stats.considered === 0) {
    console.info(
      '[trial-nudges] no live trials matched — expected if nobody is mid-trial, otherwise check that the Creem subscription.trialing event is enabled and that creem-webhook logs trialing=true',
    );
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
    await logServerError('trial-nudges', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Nudge run failed' }) };
  }
};

// 15:00 UTC — late morning US Eastern, when somebody is more likely to act on it than at dawn.
export const handler = schedule('0 15 * * *', nudgeHandler);
