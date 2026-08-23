import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk';

export const SNAPTRADE_CONFIGURED = Boolean(
  process.env.SNAPTRADE_CLIENT_ID?.trim() && process.env.SNAPTRADE_CONSUMER_KEY?.trim(),
);

let client: Snaptrade<ReturnType<typeof SnaptradeAuth.commercialApiKey>> | null = null;

/** Lazily creates the SnapTrade SDK client from env vars. Throws a clear, user-safe error if unconfigured. */
export function getSnaptrade() {
  if (client) return client;

  const clientId = process.env.SNAPTRADE_CLIENT_ID?.trim();
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY?.trim();

  if (!clientId || !consumerKey) {
    throw new Error(
      'Broker connect is not configured yet. Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY.',
    );
  }

  client = new Snaptrade({
    auth: SnaptradeAuth.commercialApiKey({ clientId, consumerKey }),
  });
  return client;
}

/** Known SnapTrade brokerage slugs we support connecting to. Looked up dynamically at connect time
 * (see resolveBrokerSlug) so this is only the fallback if the reference-data lookup fails. */
export const BROKER_SLUG_FALLBACK: Record<'SCHWAB' | 'ROBINHOOD' | 'WEBULL', string> = {
  SCHWAB: 'SCHWAB',
  ROBINHOOD: 'ROBINHOOD',
  WEBULL: 'WEBULL',
};

let brokerageCache: { id?: string; slug?: string; name?: string; display_name?: string }[] | null = null;
let brokerageCacheAt = 0;
const BROKERAGE_CACHE_TTL_MS = 60 * 60 * 1000;

/** Resolves a broker key ('SCHWAB' | 'ROBINHOOD' | 'WEBULL') to the real SnapTrade brokerage slug by
 * matching on display name, rather than hardcoding a guessed slug that could drift from SnapTrade's
 * catalog. */
export async function resolveBrokerSlug(broker: 'SCHWAB' | 'ROBINHOOD' | 'WEBULL'): Promise<string> {
  const snaptrade = getSnaptrade();
  const now = Date.now();

  if (!brokerageCache || now - brokerageCacheAt > BROKERAGE_CACHE_TTL_MS) {
    const res = await snaptrade.referenceData.listAllBrokerages();
    brokerageCache = res.data;
    brokerageCacheAt = now;
  }

  if (broker === 'WEBULL') {
    // SnapTrade lists "Webull US" and "Webull Canada" as two distinct integrations — match "webull"
    // but explicitly exclude "canada" so we never accidentally connect the wrong country's brokerage.
    const match = brokerageCache?.find((b) => {
      const name = `${b.name ?? ''} ${b.display_name ?? ''}`.toLowerCase();
      return name.includes('webull') && !name.includes('canada');
    });
    return match?.slug || BROKER_SLUG_FALLBACK.WEBULL;
  }

  const needle = broker === 'SCHWAB' ? 'schwab' : 'robinhood';
  const match = brokerageCache?.find((b) => {
    const name = `${b.name ?? ''} ${b.display_name ?? ''}`.toLowerCase();
    return name.includes(needle);
  });

  return match?.slug || BROKER_SLUG_FALLBACK[broker];
}
