import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk';
import { brokerRegistryEntry, matchesBrokerEntry } from '../src/data/brokerRegistry';

/**
 * Which SnapTrade credentials this deploy is running on.
 *
 * Exported because a user secret is only meaningful under the client that issued it: moving from
 * test to production keys invalidates every stored secret, and anything cached about a user's
 * connections while on the old client is describing a world that no longer exists.
 */
export const SNAPTRADE_CLIENT_ID = process.env.SNAPTRADE_CLIENT_ID?.trim() ?? '';

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

let brokerageCache: { id?: string; slug?: string; name?: string; display_name?: string }[] | null = null;
let brokerageCacheAt = 0;
const BROKERAGE_CACHE_TTL_MS = 60 * 60 * 1000;

/** Resolves a broker registry key (see src/data/brokerRegistry.ts) to the real SnapTrade
 * brokerage slug by matching on display name, rather than hardcoding a guessed slug that could
 * drift from SnapTrade's catalog. Falls back to the registry key itself if the lookup can't find
 * a match (SnapTrade's catalog changes independently of this app). */
export async function resolveBrokerSlug(broker: string): Promise<string> {
  const entry = brokerRegistryEntry(broker);
  if (!entry) {
    throw new Error(`Unknown broker key: ${broker}`);
  }

  const snaptrade = getSnaptrade();
  const now = Date.now();

  if (!brokerageCache || now - brokerageCacheAt > BROKERAGE_CACHE_TTL_MS) {
    try {
      const res = await snaptrade.referenceData.listAllBrokerages();
      brokerageCache = res.data;
      brokerageCacheAt = now;
    } catch (err) {
      // The lookup only turns our registry key into SnapTrade's slug, and entry.key is already the
      // fallback when no brokerage matches. Letting this throw made a reference-data hiccup fail
      // the connect itself — the user is told their broker could not be connected because a list
      // of every brokerage in the world could not be fetched, which is not a reason they can act
      // on. Better to attempt the connection with the key we have and let THAT be the answer.
      console.warn(
        '[snaptrade] brokerage list unavailable, falling back to the registry key:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  const match = brokerageCache?.find((b) => matchesBrokerEntry(`${b.name ?? ''} ${b.display_name ?? ''}`, entry));
  return match?.slug || entry.key;
}
