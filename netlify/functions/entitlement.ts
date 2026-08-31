import type { Handler } from '@netlify/functions';
import { assertCallerUid, BrokerRequestError } from '../../server/snaptradeAuth';
import { readEntitlement, effectiveTier } from '../../server/entitlements';
import { readUsed, usageResetsAt } from '../../server/usage';
import { limitsFor, MARKET_REPLAY_LIVE } from '../../src/config/tiers';

/**
 * What the signed-in user's plan currently allows, and how much of today is left.
 *
 * One endpoint rather than a client-side Firestore read because the usage counters are
 * deliberately unreadable by clients (see firestore.rules) — a remaining-count the browser can
 * edit is decoration. It also keeps the tier badge to a single request instead of a live listener,
 * which matters on a project that has already been knocked over once by Firestore read quota.
 */
export const handler: Handler = async (event) => {
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

  try {
    const record = await readEntitlement(uid);
    const tier = effectiveTier(record);
    const limits = limitsFor(tier);

    const [aiUsed, syncUsed] = await Promise.all([readUsed('ai', uid), readUsed('sync', uid)]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        tier,
        limits,
        marketReplayLive: MARKET_REPLAY_LIVE,
        status: record?.status ?? 'active',
        source: record?.source ?? null,
        currentPeriodEnd: record?.currentPeriodEnd ?? null,
        usage: {
          aiMessagesUsed: aiUsed,
          aiMessagesRemaining: Math.max(0, limits.aiMessagesPerDay - aiUsed),
          syncsUsed: syncUsed,
          syncsRemaining: Math.max(0, limits.syncsPerDay - syncUsed),
          // Sent so the UI can say when "3 left" turns back into "3 of 3", rather than leaving the
          // user to discover the boundary by being surprised by it.
          resetsAt: usageResetsAt(),
        },
      }),
    };
  } catch (err) {
    console.error('[entitlement] lookup failed:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Could not load your plan.' }),
    };
  }
};
