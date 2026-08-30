import type { Handler } from '@netlify/functions';
import { assertCallerUid, BrokerRequestError } from '../../server/snaptradeAuth';
import { getAdminAuth } from '../../server/firebaseAdmin';
import { createCheckout, CreemError, CREEM_CONFIGURED } from '../../server/creemClient';
import { readEntitlement } from '../../server/entitlements';
import { isTier, PAID_TIERS, TIER_PLANS } from '../../src/config/tiers';

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
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err instanceof CreemError ? err.message : 'Could not start checkout.',
      }),
    };
  }
};
