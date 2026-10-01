import type { Handler } from '@netlify/functions';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import { applyBillingUpdate, readEntitlement, trialPatch } from '../../server/entitlements';
import { rememberTrial } from '../../server/trialHandler';
import { paymentFailedEmail, subscriptionCanceledEmail } from '../../server/emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';
import { TIER_PLANS, type Tier } from '../../src/config/tiers';
import {
  amountFromEvent,
  parseBillingEvent,
  verifyWebhookSignature,
  type CreemWebhookEvent,
} from '../../server/creemClient';
import { logServerError } from '../../server/errorReports';
import { isPaymentEvent, recordCharge } from '../../server/billingLedger';

/**
 * Receives subscription events from Creem and turns them into entitlements.
 *
 * This endpoint is public — anyone can POST to it — so the signature check is the entire security
 * model, and nothing is read out of the body before it passes.
 *
 * Creem retries a failed delivery up to five times (30s, 5m, 30m, 6h), so the same event will
 * arrive more than once whenever anything is briefly wrong. Every path below is therefore
 * idempotent: seen events are recorded and short-circuited, and the write itself is a merge of an
 * absolute state rather than an increment.
 */

/** Non-2xx tells Creem to retry. Only use it for failures a retry could actually fix. */
function ok(body: Record<string, unknown> = { received: true }) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/** Firestore's ALREADY_EXISTS. Anything else is an outage, not a duplicate. */
function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: number | string })?.code;
  if (code === 6 || code === 'already-exists') return true;
  return /already exists/i.test(err instanceof Error ? err.message : '');
}

/**
 * Records that this event id has been seen, and says whether it had been already.
 *
 * create() fails if the doc exists, which makes "have I seen this?" a single atomic write rather
 * than a read followed by a write that two concurrent retries could both pass.
 *
 * Only a genuine ALREADY_EXISTS counts as a duplicate. Treating any failure as one would mean a
 * Firestore blip answers "seen it", the handler returns 200, Creem stops retrying, and a customer
 * who paid never gets their plan — so every other error is rethrown to force the retry.
 */
async function alreadyHandled(eventId: string): Promise<boolean> {
  try {
    await getAdminFirestore()
      .doc(`creemEvents/${eventId}`)
      .create({ receivedAt: new Date().toISOString() });
    return false;
  } catch (err) {
    if (isAlreadyExists(err)) return true;
    throw err;
  }
}

/**
 * The two billing states worth writing to somebody about.
 *
 * A failed payment is the one email in this product worth real money: most of it is an expired
 * card, and nobody finds out unless we say so — the features simply stop working. A cancellation
 * gets a note too, and deliberately not a discount: what it says is that the journal keeps
 * working for free, which is true, and is the reason people come back.
 */
async function tellThem(
  parsed: {
    uid: string;
    tier: Tier;
    status: string;
    currentPeriodEnd?: string;
  },
  eventType: string | undefined,
): Promise<void> {
  if (!isMailConfigured()) return;
  if (parsed.status !== 'past_due' && parsed.status !== 'canceled') return;

  /*
   * A pause is not a cancellation, whatever the entitlement records it as.
   *
   * A paused subscription maps to 'canceled' so that access eventually stops — which is right — but
   * it arrived here and sent an email whose subject and body both say "you will not be billed
   * again". That is a written promise the pause breaks the moment it lifts, and Creem lifts it
   * automatically. The entitlement side stays as it is; the claim does not get made.
   */
  if ((eventType ?? '').toLowerCase().includes('paused')) return;

  const account = await getAdminAuth().getUser(parsed.uid);
  if (!account.email) return;

  const tierName = TIER_PLANS[parsed.tier].name;
  const mail =
    parsed.status === 'past_due'
      ? paymentFailedEmail({ tierName, siteUrl: siteUrl() })
      : subscriptionCanceledEmail({
          tierName,
          until: parsed.currentPeriodEnd ?? null,
          siteUrl: siteUrl(),
        });

  await sendEmail({ to: account.email, ...mail, tag: `billing-${parsed.status}` });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // The signature covers the bytes as sent. Netlify base64-encodes bodies it considers binary, so
  // decode first or the HMAC is computed over the wrong string and every event is rejected.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '');

  const signature =
    event.headers['creem-signature'] ??
    event.headers['Creem-Signature'] ??
    event.headers['x-creem-signature'];

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[creem-webhook] rejected: bad or missing signature');
    // 401, not 400: a wrong secret is worth retrying after it's fixed, and Creem surfaces the
    // failures in its dashboard.
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let payload: CreemWebhookEvent;
  try {
    payload = JSON.parse(rawBody) as CreemWebhookEvent;
  } catch {
    // Unparseable will never parse. 200 so Creem stops retrying it forever.
    console.error('[creem-webhook] unparseable body');
    return ok({ received: true, ignored: 'unparseable' });
  }

  const eventId = payload.id ?? '';
  try {
    if (eventId && (await alreadyHandled(eventId))) {
      return ok({ received: true, duplicate: true });
    }
  } catch (err) {
    console.error('[creem-webhook] could not record the event id:', err);
    await logServerError('creem-webhook-dedupe', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Storage unavailable' }) };
  }

  const parsed = parseBillingEvent(payload);

  if (!parsed) {
    // Either an event type this app doesn't act on, or one with no uid in its metadata. Both are
    // "nothing to do" rather than errors — retrying would not produce a uid.
    console.info('[creem-webhook] no action for event', payload.eventType);
    return ok({ received: true, ignored: payload.eventType ?? 'unknown' });
  }

  try {
    /*
     * A trialing event is the only place the trial's dates exist.
     *
     * parseBillingEvent maps `subscription.trialing` to status 'active' on purpose — a triallist
     * has handed over a card and should pass every gate a subscriber passes — and that used to be
     * the end of it, so nothing downstream could tell a trial from a paid month. The three trial
     * emails looked for a field only a dead endpoint ever wrote, and had sent nothing to anybody.
     */
    // Read before the write, and only on a trialing event, so trialStartedAt is stamped once rather
    // than moved forward by a second delivery. applyBillingUpdate reads the record again for its own
    // grant check; one extra Firestore read on the rarest event in the set is the cheaper trade.
    const trial = trialPatch(
      parsed,
      new Date().toISOString(),
      parsed.trialing ? await readEntitlement(parsed.uid) : null,
    );
    if (parsed.trialing && !trial.trialEndsAt) {
      // Worth a line in the log: the account still counts as having had a trial, but with no end
      // date nothing can count down to the charge, which is the email that prevents a chargeback.
      console.warn(`[creem-webhook] trialing event for ${parsed.uid} carried no period end`);
    }

    const result = await applyBillingUpdate(parsed.uid, {
      tier: parsed.tier,
      status: parsed.status,
      creemSubscriptionId: parsed.creemSubscriptionId,
      creemCustomerId: parsed.creemCustomerId,
      currentPeriodEnd: parsed.currentPeriodEnd,
      ...trial,
    });

    // Books the money, separately from the entitlement. Only for events that actually charged —
    // a subscription flipping to active is not a payment, and counting one would invent revenue.
    // !parsed.trialing, because a trial start can arrive on an event whose type contains "paid".
    // amountFromEvent returns null when the payload carries no amount, and chargeAmount then falls
    // back to the list price by design — so a $0 trial start would book a full month, and the real
    // charge a week later would book it again on the one screen that answers "did you charge me
    // twice".
    if (result.applied && !parsed.trialing && isPaymentEvent(payload.eventType)) {
      await recordCharge({
        eventId,
        uid: parsed.uid,
        tier: parsed.tier,
        eventType: payload.eventType ?? '',
        // Read off the event rather than assumed from the plan, so a $0 trial start books nothing.
        amountPaid: amountFromEvent(payload),
      });
    }

    /*
     * Remembers the mailbox, so a second signup cannot take a second trial.
     *
     * Swallowed, like the email below, and for a stronger reason: this is bookkeeping about abuse,
     * and failing it must never make Creem retry a billing change that has already landed. The
     * worst case is a trial our records forget to count.
     */
    if (result.applied && parsed.trialing) {
      await rememberTrial(parsed.uid).catch((err) => {
        console.error(`[creem-webhook] could not record the trial claim for ${parsed.uid}:`, err);
      });
    }

    // Best effort, and after the entitlement is written: an email that fails must never make a
    // webhook retry, because the retry would re-apply a billing change that already landed.
    if (result.applied) await tellThem(parsed, payload.eventType).catch(() => undefined);

    console.info(
      // object.status is logged because the whole trial feature rests on Creem saying 'trialing'
      // somewhere, and nothing in this repo can prove it does. If the trial emails stay silent, this
      // line on the next real trial checkout is what settles whether the signal ever arrived.
      `[creem-webhook] ${payload.eventType} objectStatus=${payload.object?.status ?? '-'} uid=${parsed.uid} tier=${parsed.tier} status=${parsed.status} trialing=${parsed.trialing} applied=${result.applied}${result.reason ? ` (${result.reason})` : ''}`,
    );
    return ok({ received: true, applied: result.applied });
  } catch (err) {
    console.error('[creem-webhook] failed to apply entitlement:', err);
    /*
     * The single worst failure in the product: money has changed hands and the plan did not
     * arrive. Creem will retry, and the retry usually wins — but if it doesn't, this is the row
     * that says so, with the uid attached, before the customer has to notice and write in.
     */
    await logServerError('creem-webhook-apply', err, { uid: parsed.uid });
    // A real failure — let Creem retry, and undo the seen-marker so the retry isn't swallowed as
    // a duplicate of an attempt that never took effect.
    if (eventId) {
      await getAdminFirestore().doc(`creemEvents/${eventId}`).delete().catch(() => {});
    }
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not record payment' }) };
  }
};
