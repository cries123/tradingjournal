import type { Handler } from '@netlify/functions';
import { PAID_TIERS, TIER_PLANS } from '../../src/config/tiers';
import { CREEM_BASE_URL, CREEM_MODE_MISMATCH, CREEM_TEST_MODE } from '../../server/creemClient';
import { readCheckoutStatus } from '../../server/checkoutStatus';
import { maintenanceMessage } from '../../src/config/checkoutStatus';

/**
 * Which payment environment variables the server can actually see.
 *
 * Booleans only — never a key, never a fragment of one, not even a length. The value of this
 * endpoint is telling the owner *which* variable is missing, and "present: false" says that
 * completely. It's unauthenticated for the same reason /api/broker-status is: knowing whether a
 * site has finished its own setup is not a secret, and requiring an admin token to diagnose a
 * misconfiguration is exactly backwards when misconfiguration is what breaks admin.
 */
export const handler: Handler = async () => {
  const present = (name: string) => Boolean(process.env[name]?.trim());

  // Read through the same server-side path checkout uses, so the pricing page and the endpoint
  // can never disagree about whether the store is open.
  const checkout = await readCheckoutStatus();

  const products = PAID_TIERS.map((tier) => {
    const envName = TIER_PLANS[tier].productIdEnv;
    return {
      tier,
      name: TIER_PLANS[tier].name,
      envName: envName ?? null,
      present: envName ? present(envName) : false,
    };
  });

  const apiKey = present('CREEM_API_KEY');
  const webhookSecret = present('CREEM_WEBHOOK_SECRET');

  const missing: string[] = [];
  if (!apiKey) missing.push('CREEM_API_KEY');
  if (!webhookSecret) missing.push('CREEM_WEBHOOK_SECRET');
  products.filter((p) => !p.present && p.envName).forEach((p) => missing.push(p.envName!));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      // Deliberately NOT gated on the maintenance switch. `ok` answers "is payments configured
      // and healthy", which a pause does not change — the keys are fine, the host is fine, and
      // flipping the switch back resumes selling instantly. Folding the pause in here made the
      // admin panel shout "Payments is down" at an owner who had just paused checkout himself,
      // which is a false alarm on the one indicator that has to stay trustworthy.
      ok: missing.length === 0 && !CREEM_MODE_MISMATCH,
      // The owner's choice, reported separately so the panel can say "Paused" rather than "Down".
      checkoutEnabled: checkout.enabled,
      maintenanceMessage: checkout.enabled ? '' : maintenanceMessage(checkout),
      // Checkout works without the webhook secret — it just never grants anything afterwards,
      // which is the worst failure of the two and worth separating from "can't start a checkout".
      checkoutReady: apiKey && products.every((p) => p.present),
      webhookReady: webhookSecret,
      testMode: CREEM_TEST_MODE,
      // The host the server will actually call. This is the single fact that was missing while
      // debugging a 401: knowing a key is present says nothing about which environment it's being
      // sent to, and those are the two halves of the only mistake that produces "Invalid API Key"
      // from a correctly-copied key. It's a public API hostname, not a secret.
      baseUrl: CREEM_BASE_URL,
      modeMismatch: CREEM_MODE_MISMATCH,
      apiKey,
      webhookSecret,
      products,
      missing,
    }),
  };
};
