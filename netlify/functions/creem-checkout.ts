import type { Handler } from '@netlify/functions';
import { assertCallerUid, BrokerRequestError } from '../../server/snaptradeAuth';
import { getAdminAuth, getAdminFirestore } from '../../server/firebaseAdmin';
import {
  changeSubscriptionPlan,
  createCheckout,
  CreemError,
  CREEM_CONFIGURED,
  productIdForTier,
} from '../../server/creemClient';
import { readEntitlement, writeEntitlement } from '../../server/entitlements';
import { planChangeRoute } from '../../server/planChangeRoute';
import { readCheckoutStatus } from '../../server/checkoutStatus';
import { maintenanceMessage } from '../../src/config/checkoutStatus';
import { isTier, PAID_TIERS, TIER_PLANS } from '../../src/config/tiers';

/** Whether this uid is the single site admin. Never throws — a failed check just means "no". */
async function isSiteAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getAdminFirestore().doc('config/admin').get();
    return snap.exists && (snap.data() as { uid?: string }).uid === uid;
  } catch {
    return false;
  }
}

/**
 * Starts a Creem checkout for the signed-in user.
 *
 * The uid comes from a verified Firebase ID token, never from the request body — it's what the
 * webhook later uses to decide whose account to upgrade, so letting the client name it would let
 * anyone buy Diamond for someone else's account, or worse, claim someone else's payment.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!CREEM_CONFIGURED) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Checkout is not set up yet. Please try again later.' }),
    };
  }

  /*
   * The maintenance switch, checked before anything that can take money.
   *
   * Deliberately ahead of the auth check: whether the store is open is not a per-user fact, and a
   * signed-out visitor who somehow reaches this endpoint should get the same honest answer rather
   * than "sign in first" followed by "we're closed".
   *
   * This covers plan changes as well as new checkouts, because the branch below charges a
   * proration difference immediately — an upgrade during a maintenance window is a real card
   * charge, and "no purchases right now" has to mean all of them. Cancelling is untouched: it
   * lives in /api/creem-portal, which is deliberately never gated. Locking someone out of
   * cancelling while their subscription keeps billing is how a small merchant collects chargebacks.
   */
  const checkoutStatus = await readCheckoutStatus();
  if (!checkoutStatus.enabled) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        error: maintenanceMessage(checkoutStatus),
        maintenance: true,
      }),
    };
  }

  let uid: string;
  try {
    uid = await assertCallerUid(event.headers);
  } catch (err) {
    const status = err instanceof BrokerRequestError ? err.statusCode : 401;
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Sign in required' }),
    };
  }

  let body: { tier?: unknown };
  try {
    body = JSON.parse(event.body || '{}') as { tier?: unknown };
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const tier = body.tier;
  if (!isTier(tier) || !PAID_TIERS.includes(tier)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown plan' }) };
  }

  // An admin-granted tier has no subscription behind it, and the webhook deliberately refuses to
  // overwrite one. Letting someone check out anyway would take their money and change nothing.
  const existing = await readEntitlement(uid).catch(() => null);
  if (existing?.source === 'admin' && existing.status === 'active') {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: `Your account already has ${TIER_PLANS[existing.tier].name} access. Contact support if you'd like to change plans.`,
      }),
    };
  }

  /*
   * Somebody who already subscribes gets their existing subscription MOVED, never a second one.
   *
   * A new checkout here would leave two live subscriptions on one account and bill the customer
   * twice a month — which surfaces on a statement weeks later as a refund request, and enough of
   * those is how a young merchant account gets flagged. The decision itself lives in
   * planChangeRoute so every branch of it can be tested without Firestore or a live payment API.
   */
  const route = planChangeRoute(existing, tier);

  if (route.action === 'already-on-it') {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `You're already on ${TIER_PLANS[tier].name}.` }),
    };
  }

  if (route.action === 'change') {
    const productId = productIdForTier(tier);
    if (!productId) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `The ${TIER_PLANS[tier].name} plan isn't available yet.` }),
      };
    }

    try {
      await changeSubscriptionPlan(route.subscriptionId, productId, route.direction);
      // Applied locally too rather than waiting on the webhook: the user is watching the page, and
      // the webhook confirming the same tier a second later is a harmless no-op.
      await writeEntitlement(uid, { tier, status: 'active', source: 'purchase' });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changed: true,
          tier,
          direction: route.direction,
          message:
            route.direction === 'upgrade'
              ? `You're on ${TIER_PLANS[tier].name} now — we've charged the difference for the rest of this period.`
              : `You're on ${TIER_PLANS[tier].name} now — the credit comes off your next invoice.`,
        }),
      };
    } catch (err) {
      const detail = err instanceof CreemError ? err.detail : undefined;
      console.error('[creem-checkout] plan change failed:', err);
      return {
        statusCode: err instanceof CreemError ? err.statusCode : 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Never fall back to a fresh checkout here. A duplicate subscription is a worse outcome
          // than an error message, because the customer doesn't find out for a month.
          error:
            'We could not move your existing subscription onto that plan. Nothing has been charged — open Manage billing to change it, or contact support.',
          ...((await isSiteAdmin(uid)) && detail ? { detail } : {}),
        }),
      };
    }
  }

  let email: string | undefined;
  try {
    email = (await getAdminAuth().getUser(uid)).email ?? undefined;
  } catch {
    // Only used to prefill the payment form. Not worth failing checkout over.
  }

  const origin =
    process.env.PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
    event.headers.origin ||
    'https://trendchasers.net';

  try {
    const checkout = await createCheckout({
      tier,
      uid,
      email,
      successUrl: `${origin}/pricing?checkout=success&plan=${tier}`,
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: checkout.url, id: checkout.id }),
    };
  } catch (err) {
    const status = err instanceof CreemError ? err.statusCode : 500;
    console.error('[creem-checkout] failed:', err);

    // The site owner gets the real upstream error; everyone else gets the polite one. A buyer has
    // no use for "Creem returned 401" and shouldn't be shown our infrastructure, but making the
    // owner read function logs to find out their key is from the wrong environment is a bad trade.
    const detail = err instanceof CreemError ? err.detail : undefined;
    const showDetail = detail ? await isSiteAdmin(uid) : false;

    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err instanceof CreemError ? err.message : 'Could not start checkout.',
        ...(showDetail ? { detail } : {}),
      }),
    };
  }
};
