import type { Handler } from '@netlify/functions';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import { applyBillingUpdate } from '../../server/entitlements';
import { parseBillingEvent, verifyWebhookSignature, type CreemWebhookEvent } from '../../server/creemClient';
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
    logServerError('creem-webhook-dedupe', err);
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
    const result = await applyBillingUpdate(parsed.uid, {
      tier: parsed.tier,
      status: parsed.status,
      creemSubscriptionId: parsed.creemSubscriptionId,
      creemCustomerId: parsed.creemCustomerId,
      currentPeriodEnd: parsed.currentPeriodEnd,
    });

    // Books the money, separately from the entitlement. Only for events that actually charged —
    // a subscription flipping to active is not a payment, and counting one would invent revenue.
    if (result.applied && isPaymentEvent(payload.eventType)) {
      await recordCharge({
        eventId,
        uid: parsed.uid,
        tier: parsed.tier,
        eventType: payload.eventType ?? '',
      });
    }

    console.info(
      `[creem-webhook] ${payload.eventType} uid=${parsed.uid} tier=${parsed.tier} status=${parsed.status} applied=${result.applied}${result.reason ? ` (${result.reason})` : ''}`,
    );
    return ok({ received: true, applied: result.applied });
  } catch (err) {
    console.error('[creem-webhook] failed to apply entitlement:', err);
    /*
     * The single worst failure in the product: money has changed hands and the plan did not
     * arrive. Creem will retry, and the retry usually wins — but if it doesn't, this is the row
     * that says so, with the uid attached, before the customer has to notice and write in.
     */
    logServerError('creem-webhook-apply', err, { uid: parsed.uid });
    // A real failure — let Creem retry, and undo the seen-marker so the retry isn't swallowed as
    // a duplicate of an attempt that never took effect.
    if (eventId) {
      await getAdminFirestore().doc(`creemEvents/${eventId}`).delete().catch(() => {});
    }
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not record payment' }) };
  }
};
