import { schedule, type Handler } from '@netlify/functions';
import type { Trade } from '../../src/types';
import { DEFAULT_TRADING_RULES, type TradingRules } from '../../src/types/strategy';
import { tierHas } from '../../src/config/tiers';
import { checkRuleViolations } from '../../src/utils/tradingRules';
import { effectivePnl } from '../../src/utils/tradeHelpers';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import { effectiveTier, readEntitlement } from '../../server/entitlements';
import { logServerError } from '../../server/errorReports';
import { ruleAlertEmail } from '../../server/emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';
import { unsubscribeUrl } from '../../server/unsubscribeToken';

/**
 * The morning after.
 *
 * The in-app banner is the half that can change a decision; this is the half that reaches somebody
 * who closed the tab at eleven and did not open it again. It goes out once, the next morning, and
 * only when a limit was actually broken — a daily "you kept to your rules" is an email people
 * unsubscribe from on the third clear day, taking the useful ones with them.
 *
 * Diamond only, and gated on the effective tier so a complimentary grant behaves like a purchase.
 */

/** Accounts checked per run. Past this the rest wait for tomorrow rather than timing out midway. */
const MAX_PER_RUN = 400;

/** The market day this run is reporting on, in Eastern rather than UTC. */
function yesterdayEastern(now = new Date()): string {
  const eastern = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const at = Date.parse(`${eastern}T00:00:00Z`);
  return new Date(at - 86_400_000).toISOString().slice(0, 10);
}

async function tradesOn(uid: string, date: string): Promise<Trade[]> {
  const snap = await getAdminFirestore()
    .collection(`users/${uid}/trades`)
    .where('date', '==', date)
    .limit(500)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Trade, 'id'>) }));
}

async function readRules(uid: string): Promise<{ rules: TradingRules; alertsOn: boolean }> {
  const snap = await getAdminFirestore().doc(`users/${uid}/settings/preferences`).get();
  const data = (snap.data() ?? {}) as { tradingRules?: TradingRules; ruleAlertsEnabled?: unknown };
  return {
    rules: data.tradingRules ?? DEFAULT_TRADING_RULES,
    // Absent means on, the same reasoning as auto-sync: nobody who has never opened Settings has
    // this field written, and reading that as "off" would switch it off for everybody.
    alertsOn: data.ruleAlertsEnabled !== false,
  };
}

async function run(): Promise<{ considered: number; sent: number; skipped: number }> {
  const db = getAdminFirestore();
  const stats = { considered: 0, sent: 0, skipped: 0 };

  if (!isMailConfigured()) {
    console.info('[rule-alerts] no mail provider configured — nothing to do');
    return stats;
  }

  const date = yesterdayEastern();

  /*
   * The people with a broker link, not everyone with an account.
   *
   * Not a perfect population — somebody logging by hand on Diamond with rules on is missed — but
   * it is the one list that exists without a collection-group query over every user's settings
   * document, which needs an index created by hand in the console and would therefore work
   * everywhere except production. Worth revisiting if hand-loggers ever ask for this.
   */
  const connected = await db
    .collection('brokerConnections')
    .where('connected', '==', true)
    .limit(MAX_PER_RUN)
    .get();

  for (const doc of connected.docs) {
    stats.considered += 1;
    const uid = doc.id;

    try {
      // Sent once per day per account, whatever the scheduler does. A redeploy landing on the
      // boundary must not send a second copy of the same bad news.
      if ((doc.data() as { ruleAlertSentFor?: string }).ruleAlertSentFor === date) {
        stats.skipped += 1;
        continue;
      }

      const tier = effectiveTier(await readEntitlement(uid), Date.now());
      if (!tierHas(tier, 'ruleAlerts')) {
        stats.skipped += 1;
        continue;
      }

      const { rules, alertsOn } = await readRules(uid);
      if (!alertsOn || !rules.enabled) {
        stats.skipped += 1;
        continue;
      }

      const trades = await tradesOn(uid, date);
      const breaches = checkRuleViolations(trades, rules);
      if (breaches.length === 0) {
        stats.skipped += 1;
        continue;
      }

      const user = await getAdminAuth().getUser(uid);
      if (!user.email) {
        stats.skipped += 1;
        continue;
      }

      const mail = ruleAlertEmail({
        date,
        breaches,
        dayPnl: trades.reduce((sum, t) => sum + effectivePnl(t), 0),
        tradeCount: trades.length,
        siteUrl: siteUrl(),
        unsubscribeUrl: unsubscribeUrl(siteUrl(), uid),
      });

      const outcome = await sendEmail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: 'rule-alert',
      });

      if (outcome.sent) {
        stats.sent += 1;
        await doc.ref.set({ ruleAlertSentFor: date }, { merge: true });
      } else {
        stats.skipped += 1;
      }
    } catch (err) {
      // One unreadable account must not end the run for everybody after it in the list.
      stats.skipped += 1;
      console.error(`[rule-alerts] skipped ${uid}:`, err);
    }
  }

  console.info(`[rule-alerts] considered=${stats.considered} sent=${stats.sent} skipped=${stats.skipped}`);
  return stats;
}

const alertHandler: Handler = async () => {
  try {
    return { statusCode: 200, body: JSON.stringify(await run()) };
  } catch (err) {
    console.error('[rule-alerts] run failed:', err);
    logServerError('rule-alerts', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Rule alert run failed' }) };
  }
};

/* 12:00 UTC, Tuesday to Saturday — after the automatic import at 11:00 has put the previous day's
   fills in the journal, so the breach is computed from a complete day rather than half of one. */
export const handler = schedule('0 12 * * 2-6', alertHandler);
