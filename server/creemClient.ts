import crypto from 'crypto';
import { isTier, TIER_PLANS, type Tier } from '../src/config/tiers';

/**
 * Thin wrapper over the Creem billing API.
 *
 * Creem replaced Stripe here, so everything payment-related lives behind this one file: if the
 * processor ever has to change again, the blast radius is this module plus two function handlers,
 * not every screen that mentions a plan.
 */

const CREEM_API_KEY = process.env.CREEM_API_KEY?.trim() ?? '';
const CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET?.trim() ?? '';

/**
 * Creem runs a completely separate test environment on its own host, with its own keys and its own
 * product ids. A test key sent to the live host comes back "Invalid API Key" even when it was
 * copied perfectly — which reads as a typo and sends you checking the wrong thing.
 *
 * So the key itself decides, and CREEM_TEST_MODE is only the override for a key whose prefix
 * doesn't say. Deriving it removes the mismatch as a possible state rather than documenting it.
 */
const KEY_LOOKS_LIKE_TEST = /^creem_test/i.test(CREEM_API_KEY);
const TEST_MODE_ENV = process.env.CREEM_TEST_MODE?.trim().toLowerCase();
export const CREEM_TEST_MODE =
  TEST_MODE_ENV === 'true' ? true : TEST_MODE_ENV === 'false' ? false : KEY_LOOKS_LIKE_TEST;

/** True when the two disagree — the one state that produces a confusing 401. */
export const CREEM_MODE_MISMATCH = KEY_LOOKS_LIKE_TEST && TEST_MODE_ENV === 'false';

export const CREEM_BASE_URL =
  process.env.CREEM_BASE_URL?.trim() ||
  (CREEM_TEST_MODE ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');

export const CREEM_CONFIGURED = Boolean(CREEM_API_KEY);

export class CreemError extends Error {
  statusCode: number;
  /**
   * The upstream status and body, for the site owner's eyes only.
   *
   * Creem's own error messages are specific and useful ("Invalid API Key", a missing product) and
   * burying them in a function log means every misconfiguration costs a round trip through the
   * Netlify dashboard. The handler decides who is allowed to see this; the client never sends it
   * to an ordinary buyer.
   */
  detail?: string;

  constructor(message: string, statusCode: number, detail?: string) {
    super(message);
    this.name = 'CreemError';
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

/** The Creem product id backing a paid tier, or null when that tier hasn't been set up yet. */
export function productIdForTier(tier: Tier): string | null {
  const envName = TIER_PLANS[tier].productIdEnv;
  if (!envName) return null;
  return process.env[envName]?.trim() || null;
}

/** Reverse of productIdForTier — which tier a webhook's product id refers to. */
export function tierForProductId(productId: string | undefined | null): Tier | null {
  if (!productId) return null;
  for (const tier of Object.keys(TIER_PLANS) as Tier[]) {
    if (productIdForTier(tier) === productId) return tier;
  }
  return null;
}

export interface CreateCheckoutArgs {
  tier: Tier;
  uid: string;
  email?: string;
  successUrl: string;
}

/**
 * Creates a hosted checkout and returns the URL to send the buyer to.
 *
 * `metadata.uid` is the load-bearing part: Creem echoes metadata back on every webhook for the
 * resulting subscription, and it is the only reliable link from a payment to a Firebase account.
 * Matching on email instead would break the moment somebody pays with a different address than
 * they signed up with, which is common enough to be a support queue on its own.
 */
export async function createCheckout(args: CreateCheckoutArgs): Promise<{ url: string; id: string }> {
  if (!CREEM_CONFIGURED) {
    throw new CreemError('Payments are not configured yet. Please try again later.', 503);
  }

  const productId = productIdForTier(args.tier);
  if (!productId) {
    throw new CreemError(`The ${TIER_PLANS[args.tier].name} plan isn't available for purchase yet.`, 503);
  }

  const res = await fetch(`${CREEM_BASE_URL}/checkouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CREEM_API_KEY },
    body: JSON.stringify({
      product_id: productId,
      success_url: args.successUrl,
      // Duplicated onto the customer object as well because Creem prefills the payment form from
      // there; metadata is for us, customer is for the buyer.
      ...(args.email ? { customer: { email: args.email } } : {}),
      metadata: { uid: args.uid, tier: args.tier },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(
      `[creem] checkout failed (${CREEM_TEST_MODE ? 'test' : 'live'} mode, ${CREEM_BASE_URL})`,
      res.status,
      text.slice(0, 500),
    );

    // A 401 here is almost never a mistyped key — it's a key from the other environment. Say so,
    // because "invalid key" sends the owner to re-copy a key that was already correct.
    const hint =
      res.status === 401
        ? ` — a 401 from ${CREEM_BASE_URL} usually means the key belongs to Creem's ${
            CREEM_TEST_MODE ? 'live' : 'test'
          } environment instead. Check CREEM_API_KEY and CREEM_TEST_MODE together, and make sure the product ids came from the same environment as the key.`
        : '';

    throw new CreemError(
      'Could not start checkout. Please try again in a moment.',
      502,
      `Creem returned ${res.status}: ${text.slice(0, 300)}${hint}`,
    );
  }

  let parsed: { checkout_url?: string; url?: string; id?: string };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new CreemError('Payment provider returned an unreadable response.', 502);
  }

  const url = parsed.checkout_url || parsed.url;
  if (!url) {
    console.error('[creem] checkout response had no url:', text.slice(0, 500));
    throw new CreemError('Payment provider did not return a checkout link.', 502);
  }

  return { url, id: parsed.id ?? '' };
}

/** Shared plumbing for the authenticated Creem calls that aren't checkout. */
async function creemPost(
  path: string,
  body: Record<string, unknown>,
  failureMessage: string,
): Promise<Record<string, unknown>> {
  if (!CREEM_CONFIGURED) {
    throw new CreemError('Payments are not configured yet. Please try again later.', 503);
  }

  const res = await fetch(`${CREEM_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CREEM_API_KEY },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[creem] ${path} failed`, res.status, text.slice(0, 500));
    throw new CreemError(failureMessage, 502, `Creem returned ${res.status}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Moves an existing subscription onto a different plan, in place.
 *
 * This is the whole reason the endpoint exists: starting a second checkout for someone who already
 * subscribes leaves them with TWO live subscriptions and two monthly charges. They notice on the
 * statement, not at the checkout, which makes it a refund and a chargeback rather than a bug
 * report.
 *
 * Proration differs by direction on purpose. Going up, the customer is charged the difference now
 * and gets the bigger plan now — charging later for access granted today is how you end up
 * arguing about an invoice. Going down, the credit is settled against the next invoice instead:
 * taking an immediate payment from someone who just reduced their spend would be absurd.
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  productId: string,
  direction: 'upgrade' | 'downgrade',
): Promise<void> {
  await creemPost(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/upgrade`,
    {
      product_id: productId,
      update_behavior:
        direction === 'upgrade' ? 'proration-charge-immediately' : 'proration-charge',
    },
    'Could not change your plan. Please try again in a moment.',
  );
}

/**
 * A link to Creem's own billing portal, where the customer manages their card and cancels.
 *
 * Deliberately not rebuilt in-app. Card details and cancellation flows are the processor's job,
 * and a cancel button of my own would be one more thing that can silently fail between here and
 * the actual subscription.
 */
export async function createBillingPortalLink(customerId: string): Promise<string> {
  const data = await creemPost(
    '/customers/billing',
    { customer_id: customerId },
    'Could not open the billing portal. Please try again in a moment.',
  );

  const link = data.customer_portal_link;
  if (typeof link !== 'string' || !link) {
    throw new CreemError('Payment provider did not return a billing link.', 502);
  }
  return link;
}

/**
 * Verifies the `creem-signature` header against the raw request body.
 *
 * Compared with timingSafeEqual rather than `===` so the comparison can't be used as an oracle to
 * guess a valid signature byte by byte. Without this check the webhook endpoint is a public URL
 * that hands out paid tiers to anyone who can POST JSON at it.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!CREEM_WEBHOOK_SECRET) {
    console.error('[creem] CREEM_WEBHOOK_SECRET is not set — refusing all webhooks');
    return false;
  }
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', CREEM_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const given = signature.trim().toLowerCase();

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** The subset of a Creem webhook payload this app acts on. */
export interface CreemWebhookEvent {
  id?: string;
  eventType?: string;
  created_at?: number | string;
  object?: {
    id?: string;
    status?: string;
    metadata?: Record<string, unknown> | null;
    product?: { id?: string } | string | null;
    customer?: { id?: string; email?: string } | string | null;
    current_period_end_date?: string | null;
    subscription?: { id?: string; metadata?: Record<string, unknown> | null } | string | null;
  } | null;
}

function readId(value: { id?: string } | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

export interface ParsedBillingEvent {
  uid: string;
  tier: Tier;
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  creemSubscriptionId?: string;
  creemCustomerId?: string;
  currentPeriodEnd?: string;
}

/**
 * Maps a Creem event onto an entitlement change, or null when there's nothing to do.
 *
 * Returning null for unknown event types matters: Creem sends more kinds of event than this app
 * cares about, and treating an unrecognised one as a downgrade would revoke access on a
 * bookkeeping notification.
 */
export function parseBillingEvent(event: CreemWebhookEvent): ParsedBillingEvent | null {
  const obj = event.object;
  if (!obj) return null;

  const type = (event.eventType ?? '').toLowerCase();

  const status: ParsedBillingEvent['status'] | null = type.includes('canceled')
    ? 'canceled'
    : type.includes('expired')
      ? 'expired'
      : type.includes('past_due') || type.includes('unpaid')
        ? 'past_due'
        : type.includes('paid') || type.includes('active') || type.includes('completed')
          ? 'active'
          : null;

  if (!status) return null;

  const metadata =
    obj.metadata ??
    (obj.subscription && typeof obj.subscription !== 'string' ? obj.subscription.metadata : null) ??
    null;

  const uid = typeof metadata?.uid === 'string' ? metadata.uid : '';
  if (!uid) return null;

  // Prefer the product the subscription is actually for; fall back to what checkout was started
  // with, since a webhook for a cancelled subscription may not repeat the product.
  const tier =
    tierForProductId(readId(obj.product)) ??
    (isTier(metadata?.tier) ? (metadata.tier as Tier) : null);
  if (!tier) return null;

  return {
    uid,
    tier,
    status,
    creemSubscriptionId: subscriptionIdFrom(event),
    creemCustomerId: readId(obj.customer),
    currentPeriodEnd: obj.current_period_end_date ?? undefined,
  };
}

/**
 * The id of the SUBSCRIPTION this event concerns — never the checkout's own id.
 *
 * One purchase emits both `checkout.completed` and `subscription.paid`, in no guaranteed order,
 * and on the checkout event `object.id` is a checkout id. Storing that as the subscription id
 * looks harmless until you try to change the plan later: the upgrade call 404s, and the fallback
 * is to sell them a second subscription. So a bare `object.id` is only trusted on an event that
 * is actually about a subscription.
 */
function subscriptionIdFrom(event: CreemWebhookEvent): string | undefined {
  const obj = event.object;
  if (!obj) return undefined;

  const nested = readId(obj.subscription);
  if (nested) return nested;

  const type = (event.eventType ?? '').toLowerCase();
  return type.startsWith('subscription') ? obj.id : undefined;
}
