import { schedule, type Handler } from '@netlify/functions';
import type { Trade } from '../../src/types';
import { computeWeeklyRecap } from '../../src/utils/insights';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import { logServerError } from '../../server/errorReports';
import { aiRecapEmail, weeklyRecapEmail } from '../../server/emailTemplates';
import { writeReview } from '../../server/aiAssistantHandler';
import { effectiveTier, readEntitlement } from '../../server/entitlements';
import { tierHas, TIER_ORDER } from '../../src/config/tiers';
import { buildJournalFacts } from '../../src/utils/journalFacts';
import { recordAutomatic } from '../../server/usage';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';
import { unsubscribeUrl } from '../../server/unsubscribeToken';

/**
 * The Sunday recap.
 *
 * computeWeeklyRecap has been producing a genuinely good summary of somebody's week since long
 * before this existed, and it only ever appeared to people who happened to open the app. This is
 * the half that goes and finds them — which for a trading journal is the whole retention
 * mechanism, because the habit it depends on is weekly and the product has no other way to start
 * one.
 *
 * Three rules that keep it from becoming spam:
 *
 *  - Opt-in only, from a preference the user set themselves.
 *  - Never sent for a week with no trades. A recap of a week somebody didn't trade is a guilt
 *    email, and the fastest way to teach a person to ignore this sender.
 *  - Not sent twice. A scheduled function can fire more than once — a retry, a redeploy landing on
 *    the boundary — and the send is recorded so the second attempt does nothing.
 */

/** Recipients per run. A ceiling rather than a target: past this the run stops and the rest go out
 *  next week, which is a better failure than a function timing out halfway with no record of how
 *  far it got. */
const MAX_RECIPIENTS_PER_RUN = 400;

/** Two weeks of trades: computeWeeklyRecap compares this week against the one before it. */
const LOOKBACK_DAYS = 14;

/** Skip anyone who already got one recently, whatever the schedule did. */
const RESEND_GUARD_DAYS = 3;

function dayKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

async function recentTrades(uid: string): Promise<Trade[]> {
  const snap = await getAdminFirestore()
    .collection(`users/${uid}/trades`)
    // A range on one field inside a subcollection rides Firestore's automatic single-field index,
    // so this needs no composite index anyone has to remember to create.
    .where('date', '>=', dayKey(LOOKBACK_DAYS))
    .limit(1000)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Trade, 'id'>) }));
}

/**
 * The assistant's version of the week, for the tier that pays for it.
 *
 * Null for everybody else, and null on any failure — the caller falls back to the templated recap
 * that has always worked. A model outage on a Sunday morning must cost Diamond users the better
 * email, never the email.
 *
 * Notes are deliberately not included. The opt-in for sending written notes to the model is a
 * choice made in the assistant panel, by a person, for a conversation they are watching; a
 * scheduled job cannot inherit that consent.
 */
async function diamondReview(uid: string, trades: Trade[]): Promise<string | null> {
  try {
    const tier = effectiveTier(await readEntitlement(uid), Date.now());
    if (!tierHas(tier, 'aiReview')) return null;

    const facts = buildJournalFacts(trades, 'the last 7 days', { includeNotes: false });
    if (!facts) return null;

    const review = await writeReview(
      facts,
      'Write my weekly review. Three short paragraphs, no headings, no lists. Say what actually ' +
        'happened this week, the one thing most worth changing, and what to watch next week. ' +
        'Quote only figures from the stats given. If the sample is too thin to conclude ' +
        'anything, say so plainly instead of inventing a pattern.',
    );
    if (!review) return null;

    // The call was made and will appear on the bill, so the cost report has to see it — without
    // taking a message out of an allowance the trader never spent.
    await recordAutomatic('ai', uid, 1);
    return review;
  } catch (err) {
    console.warn(`[weekly-recap] could not write a review for ${uid}:`, err);
    return null;
  }
}

interface RecapPrefs {
  lastRecapSentAt?: string;
}

/**
 * Who gets a recap this week: everyone who asked for one, plus the tier that is sold one.
 *
 * This used to be the opt-in collection alone — emailPrefs where recap == true — and the default
 * for that flag is false. So a Diamond subscriber who never went into Settings and found the
 * toggle was not in the recipient list at all, while the pricing page sold them "a weekly review
 * written by the assistant, emailed to you". Most of them never received the thing they were
 * paying for and had no way to know it existed.
 *
 * Two sources, unioned:
 *
 *   - An explicit opt-in, from any tier. Unchanged, and still the only way a Free or Silver
 *     account gets one.
 *   - Any account whose plan includes aiReview and has not explicitly opted OUT. Defaulting an
 *     email on is only defensible when the email is the product they bought; it is not defensible
 *     for the tiers that were never promised it, which is why this is keyed on the entitlement
 *     rather than applied to everybody.
 *
 * The unsubscribe link in the footer has always worked, and an opt-out written from it is a
 * recap:false document, which this respects.
 *
 * One known gap: an account comped Diamond sits at tier 'free' with the grant inside `comp`, so
 * the query below does not see it. Those are hand-granted and rare, and the toggle in Settings
 * still works for them.
 */
async function recapRecipients(
  db: FirebaseFirestore.Firestore,
): Promise<Map<string, RecapPrefs>> {
  const chosen = new Map<string, RecapPrefs>();

  const optedIn = await db
    .collection('emailPrefs')
    .where('recap', '==', true)
    .limit(MAX_RECIPIENTS_PER_RUN)
    .get();
  for (const doc of optedIn.docs) chosen.set(doc.id, doc.data() as RecapPrefs);

  // The tiers that include the written review. Derived rather than hardcoded so adding aiReview to
  // another plan brings its subscribers with it.
  const included = TIER_ORDER.filter((t) => tierHas(t, 'aiReview'));
  if (included.length === 0) return chosen;

  const entitled = await db
    .collection('entitlements')
    .where('tier', 'in', included)
    .limit(MAX_RECIPIENTS_PER_RUN)
    .get();

  for (const doc of entitled.docs) {
    const uid = doc.id;
    if (chosen.has(uid)) continue;
    // A lapsed or past_due subscription is not entitled to it, so ask the same function every
    // other gate in the product asks rather than trusting the stored tier.
    if (!tierHas(effectiveTier(doc.data() as never, Date.now()), 'aiReview')) continue;

    const prefs = await db.doc(`emailPrefs/${uid}`).get();
    const data = prefs.data() as ({ recap?: unknown } & RecapPrefs) | undefined;
    if (data?.recap === false) continue; // said no, explicitly

    chosen.set(uid, data ?? {});
  }

  return chosen;
}

async function runRecap(): Promise<{ considered: number; sent: number; skipped: number }> {
  const db = getAdminFirestore();
  const stats = { considered: 0, sent: 0, skipped: 0 };

  if (!isMailConfigured()) {
    console.info('[weekly-recap] no mail provider configured — nothing to do');
    return stats;
  }

  const recipients = await recapRecipients(db);
  const guard = dayKey(RESEND_GUARD_DAYS);

  for (const [uid, prefs] of recipients) {
    stats.considered += 1;

    try {
      if (prefs.lastRecapSentAt && prefs.lastRecapSentAt.slice(0, 10) >= guard) {
        stats.skipped += 1;
        continue;
      }

      const trades = await recentTrades(uid);
      const recap = computeWeeklyRecap(trades);
      if (!recap) {
        stats.skipped += 1;
        continue;
      }

      const user = await getAdminAuth().getUser(uid);
      if (!user.email) {
        stats.skipped += 1;
        continue;
      }

      const review = await diamondReview(uid, trades);
      const mail = review
        ? aiRecapEmail({
            recap,
            review,
            siteUrl: siteUrl(),
            unsubscribeUrl: unsubscribeUrl(siteUrl(), uid),
          })
        : weeklyRecapEmail({
            recap,
            siteUrl: siteUrl(),
            unsubscribeUrl: unsubscribeUrl(siteUrl(), uid),
          });

      const outcome = await sendEmail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: 'weekly-recap',
      });

      if (outcome.sent) {
        stats.sent += 1;
        /*
         * Merged rather than set on a doc reference from the query, because a recipient chosen by
         * entitlement may have no emailPrefs document at all — that is the whole point of the
         * change. Writing the timestamp creates one, which also gives the resend guard above
         * something to read next week.
         */
        await db
          .doc(`emailPrefs/${uid}`)
          .set({ uid, lastRecapSentAt: new Date().toISOString() }, { merge: true });
      } else {
        stats.skipped += 1;
      }
    } catch (err) {
      // One user's missing account or unreadable trades must not end the run for everybody after
      // them in the list.
      stats.skipped += 1;
      console.error(`[weekly-recap] skipped ${uid}:`, err);
    }
  }

  console.info(
    `[weekly-recap] considered=${stats.considered} sent=${stats.sent} skipped=${stats.skipped}`,
  );
  return stats;
}

const recapHandler: Handler = async () => {
  try {
    const stats = await runRecap();
    return { statusCode: 200, body: JSON.stringify(stats) };
  } catch (err) {
    console.error('[weekly-recap] run failed:', err);
    logServerError('weekly-recap', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Recap run failed' }) };
  }
};

// Sunday 14:00 UTC — mid-morning US Eastern, after the week has closed and before anyone is
// thinking about Monday. Netlify evaluates cron in UTC.
export const handler = schedule('0 14 * * 0', recapHandler);
