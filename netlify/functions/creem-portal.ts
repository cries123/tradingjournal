import type { Handler } from '@netlify/functions';
import { assertCallerUid, BrokerRequestError } from '../../server/snaptradeAuth';
import { createBillingPortalLink, CreemError, CREEM_CONFIGURED } from '../../server/creemClient';
import { readEntitlement } from '../../server/entitlements';

/**
 * A one-time link into Creem's billing portal for the signed-in customer.
 *
 * Cancelling, changing a card and downloading invoices all live there rather than being rebuilt
 * here. That's not laziness: a cancel button of my own is one more thing that can report success
 * while the subscription quietly keeps billing, and "I cancelled and you charged me anyway" is the
 * single worst message a small SaaS can receive.
 *
 * The customer id comes from their own entitlement record, never from the request, so nobody can
 * open a portal session for somebody else's billing account.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!CREEM_CONFIGURED) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Billing is not set up yet.' }),
    };
  }

  let uid: string;
  try {
    uid = await assertCallerUid(event.headers);
  } catch (err) {
    return {
      statusCode: err instanceof BrokerRequestError ? err.statusCode : 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Sign in required' }),
    };
  }

  const entitlement = await readEntitlement(uid).catch(() => null);

  if (entitlement?.source === 'admin') {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: "Your plan was granted directly, so there's no subscription to manage.",
      }),
    };
  }

  if (!entitlement?.creemCustomerId) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "You don't have a subscription to manage yet." }),
    };
  }

  try {
    const url = await createBillingPortalLink(entitlement.creemCustomerId);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ url }),
    };
  } catch (err) {
    console.error('[creem-portal] failed:', err);
    return {
      statusCode: err instanceof CreemError ? err.statusCode : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err instanceof CreemError ? err.message : 'Could not open the billing portal.',
      }),
    };
  }
};
