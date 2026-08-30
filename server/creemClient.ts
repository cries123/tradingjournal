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
 * Creem runs a completely separate test environment on its own host with its own keys and its own
 * product ids. Pointing at the wrong one is the classic way to end up with a checkout that
 * "works" but never charges anybody, so it's a single explicit switch rather than something
 * inferred from the key.
 */
const CREEM_TEST_MODE = String(process.env.CREEM_TEST_MODE ?? '').toLowerCase() === 'true';
const CREEM_BASE_URL =
  process.env.CREEM_BASE_URL?.trim() ||
  (CREEM_TEST_MODE ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');

export const CREEM_CONFIGURED = Boolean(CREEM_API_KEY);

export class CreemError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'CreemError';
    this.statusCode = statusCode;
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
    console.error('[creem] checkout failed', res.status, text.slice(0, 500));
    throw new CreemError('Could not start checkout. Please try again in a moment.', 502);
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
    creemSubscriptionId: readId(obj.subscription) ?? obj.id,
    creemCustomerId: readId(obj.customer),
    currentPeriodEnd: obj.current_period_end_date ?? undefined,
  };
}
