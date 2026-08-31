import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { getSnaptrade, resolveBrokerSlug, SNAPTRADE_CONFIGURED } from './snaptradeClient';
import { getAdminFirestore } from './firebaseAdmin';
import { mapSnapTradeActivitiesToTrades, type SnapTradeActivityLike } from './mapSnapTradeActivities';
import { BROKER_REGISTRY, brokerRegistryEntry, isBrokerRegistryKey } from '../src/data/brokerRegistry';
import { resolveAccess } from './entitlements';
import { consumeDaily, refundDaily } from './usage';
import { isUpstreamOutage } from './upstreamErrors';
import { lowestTierWith, TIER_PLANS, type Tier } from '../src/config/tiers';

export type SupportedBroker = string;

export type BrokerConnectAction = 'connect' | 'status' | 'sync' | 'disconnect';

export interface BrokerConnectRequestBody {
  action: BrokerConnectAction;
  broker?: string;
  accountId?: string;
  authorizationId?: string;
  startDate?: string;
  endDate?: string;
}

export interface BrokerConnectResult {
  statusCode: number;
  body: Record<string, unknown>;
}

interface SnaptradeCreds {
  userId: string;
  userSecret: string;
}

// Stored under a private subcollection (not `users/{uid}` itself) so the client-side Firestore
// rules never need to, and never accidentally do, expose this secret — only the admin SDK (this
// server code) can reach `users/{uid}/private/*`, since no client-facing rule matches that path.
function privateSnaptradeDoc(uid: string) {
  return getAdminFirestore().doc(`users/${uid}/private/snaptrade`);
}

/**
 * True when SnapTrade is telling us this user is already registered with them.
 *
 * This is the state you land in when our stored secret and SnapTrade's records disagree: we think
 * the user is new, SnapTrade knows they aren't, and registering again is rejected forever. Without
 * recovery it is a permanent dead end — every Connect attempt fails identically, with a 500 that
 * says nothing useful.
 */
function isAlreadyRegistered(err: unknown): boolean {
  const status = (err as { status?: number; response?: { status?: number } } | null)?.response
    ?.status ?? (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    status === 400 &&
    (message.includes('already') || message.includes('exist') || message.includes('registered'))
  );
}

async function getOrRegisterCreds(uid: string): Promise<SnaptradeCreds> {
  const ref = privateSnaptradeDoc(uid);
  const snap = await ref.get();
  const existing = (snap.data() ?? null) as SnaptradeCreds | null;
  if (existing?.userSecret) return existing;

  const snaptrade = getSnaptrade();

  try {
    const res = await snaptrade.authentication.registerSnapTradeUser({ userId: uid });
    const creds: SnaptradeCreds = { userId: uid, userSecret: res.data.userSecret! };
    await ref.set(creds);
    return creds;
  } catch (err) {
    if (!isAlreadyRegistered(err)) throw err;

    // SnapTrade has this user but we've lost the secret — ask for a new one rather than leaving
    // the account permanently unable to connect. The old secret is invalidated by this call, which
    // is fine: we didn't have it. Existing brokerage authorizations survive.
    console.warn(`[broker-connect] ${uid} exists at SnapTrade but we have no secret — resetting.`);
    const reset = await snaptrade.authentication.resetSnapTradeUserSecret({
      userId: uid,
      userSecret: existing?.userSecret ?? '',
    });
    const creds: SnaptradeCreds = { userId: uid, userSecret: reset.data.userSecret! };
    await ref.set(creds);
    return creds;
  }
}

/**
 * Whether SnapTrade rejected the credentials themselves, as opposed to failing the request.
 *
 * A stored userSecret can stop being valid without anything about it changing: rotating the
 * consumer key, or moving the app between SnapTrade's test and production environments, leaves
 * every secret in Firestore issued against credentials that no longer recognise it. Nothing in the
 * old flow noticed — getOrRegisterCreds returns a cached secret without ever validating it, so the
 * user would keep hitting auth errors forever with no path back.
 */
function isRejectedCredential(err: unknown): boolean {
  // An outage is never evidence that this user's secret is wrong, and the recovery below deletes
  // it — so a provider having a bad day must not be allowed to look like a bad credential. During
  // an outage a degraded API can answer 401 or "user not found" for reasons that have nothing to
  // do with the caller, and re-registering on that would break connections that were working.
  if (isUpstreamOutage(err)) return false;

  const status = (err as { status?: number; response?: { status?: number } } | null)?.response
    ?.status ?? (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return true;

  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('signature') ||
    message.includes('unauthorized') ||
    message.includes('unable to verify') ||
    (message.includes('user') && message.includes('not found'))
  );
}

/**
 * Runs an authenticated SnapTrade call, and treats a rejected secret as recoverable exactly once.
 *
 * The retry re-registers the user, which mints a working secret but does NOT restore their
 * brokerage authorizations — those live in the environment the connection was made against. So a
 * successful retry still means "you are known to us again, now reconnect your broker", and the
 * caller surfaces that rather than pretending the sync worked.
 */
async function withCredentialRecovery<T>(
  uid: string,
  creds: SnaptradeCreds,
  call: (creds: SnaptradeCreds) => Promise<T>,
): Promise<T> {
  try {
    return await call(creds);
  } catch (err) {
    if (!isRejectedCredential(err)) throw err;

    console.warn(`[broker-connect] stored secret for ${uid} was rejected — re-registering.`);
    await privateSnaptradeDoc(uid).delete().catch(() => {});

    const fresh = await getOrRegisterCreds(uid);
    try {
      return await call(fresh);
    } catch (retryErr) {
      if (!isRejectedCredential(retryErr)) throw retryErr;
      // The new secret is valid; what is missing is the brokerage connection itself. Say that,
      // rather than handing the user a SnapTrade signature error to interpret.
      throw new BrokerRequestError(
        'Your broker connection needs to be set up again. Open Connect Broker and reconnect your account.',
        409,
      );
    }
  }
}

async function getCredsIfRegistered(uid: string): Promise<SnaptradeCreds | null> {
  const snap = await privateSnaptradeDoc(uid).get();
  const existing = (snap.data() ?? null) as SnaptradeCreds | null;
  return existing?.userSecret ? existing : null;
}

/**
 * Mirrors "does this user actually have a broker linked" into a plain Firestore doc.
 *
 * SnapTrade is the source of truth for connections, and asking it is a per-user API call — fine
 * for one user loading their own page, useless for an admin dashboard that wants a single
 * number across everyone. So each time we learn a user's real connection state, we write it
 * down here. Contains no secrets: institution names and counts only, unlike users/{uid}/private
 * /snaptrade which holds the userSecret.
 *
 * Best-effort by design — a failure to record analytics must never fail the broker call the
 * user is actually waiting on.
 */
async function recordBrokerConnectionState(
  uid: string,
  institutions: string[],
  accountCount: number,
): Promise<void> {
  try {
    const ref = getAdminFirestore().doc(`brokerConnections/${uid}`);
    const now = new Date().toISOString();
    const existing = await ref.get();

    await ref.set(
      {
        uid,
        connected: accountCount > 0,
        accountCount,
        institutions,
        lastCheckedAt: now,
        // Only stamped the first time we ever see them connected, so it survives a later
        // disconnect and still answers "when did this user first link a broker".
        ...(accountCount > 0 && !existing.data()?.firstConnectedAt
          ? { firstConnectedAt: now }
          : {}),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[broker-connect] could not record connection state:', err);
  }
}

/**
 * Refuses the request when the caller's plan doesn't include broker sync at all.
 *
 * Every SnapTrade connection costs a real $1/month whether or not it's used, so this gate is the
 * one standing between the free tier and an unbounded bill. It runs on the server because the
 * client-side lock is a courtesy, not a control.
 */
function assertBrokerSyncIncluded(tier: Tier, brokers: number): void {
  if (brokers > 0) return;
  const needed = lowestTierWith('brokerSync');
  throw new BrokerRequestError(
    `Connecting a broker is part of ${needed ? TIER_PLANS[needed].name : 'a paid plan'}. Upgrade your plan to import trades from your broker.`,
    402,
  );
}

/**
 * A sync failure that also reports where the user's allowance actually stands.
 *
 * A plain error told the client nothing about the meter, so the badge kept showing the count from
 * page load while the real one drained — which is how three syncs disappeared behind a single
 * error message. Carrying the numbers on the failure is what makes the drain visible.
 */
export class BrokerSyncError extends BrokerRequestError {
  syncsRemaining: number;
  syncsPerDay: number;

  constructor(message: string, statusCode: number, syncsRemaining: number, syncsPerDay: number) {
    super(message, statusCode);
    this.name = 'BrokerSyncError';
    this.syncsRemaining = syncsRemaining;
    this.syncsPerDay = syncsPerDay;
  }
}

/** How many distinct brokerages this user already has authorised. */
async function countConnections(creds: SnaptradeCreds): Promise<number> {
  const res = await getSnaptrade().accountInformation.listUserAccounts({
    userId: creds.userId,
    userSecret: creds.userSecret,
  });
  // Counted by authorisation, not by account: one brokerage login can expose several accounts
  // (cash, margin, IRA), and charging someone three of their connections for one broker would be
  // wrong on the plan they actually bought.
  return new Set(
    res.data.map((a) => a.brokerage_authorization).filter((id): id is string => Boolean(id)),
  ).size;
}

async function handleConnect(uid: string, broker?: string): Promise<BrokerConnectResult> {
  if (!isBrokerRegistryKey(broker)) {
    const keys = BROKER_REGISTRY.map((b) => b.key).join(', ');
    throw new BrokerRequestError(`Unsupported broker. Use one of: ${keys}.`, 400);
  }

  // Refused here as well as in the UI. A stale tab, a cached bundle or a direct API call would
  // otherwise start a connection we already know cannot complete — and the user would find that
  // out on a blank page hosted by a company they have never heard of.
  const registryEntry = brokerRegistryEntry(broker);
  if (registryEntry?.status?.kind === 'down') {
    throw new BrokerRequestError(registryEntry.status.message, 503);
  }

  const { tier, limits } = await resolveAccess(uid);
  assertBrokerSyncIncluded(tier, limits.brokers);

  const creds = await getOrRegisterCreds(uid);

  // Checked against live connections rather than a stored count, because a connection can also be
  // removed from the broker's own side and a stale counter would lock someone out of a slot they
  // no longer occupy.
  const existing = await countConnections(creds).catch(() => 0);
  if (existing >= limits.brokers) {
    throw new BrokerRequestError(
      limits.brokers === 1
        ? `${TIER_PLANS[tier].name} includes one broker connection, and you already have one. Disconnect it first, or upgrade for more.`
        : `${TIER_PLANS[tier].name} includes ${limits.brokers} broker connections and you're using all of them. Disconnect one first, or upgrade for more.`,
      402,
    );
  }

  const snaptrade = getSnaptrade();
  const brokerSlug = await resolveBrokerSlug(broker);
  const siteUrl = (process.env.SITE_URL || 'https://trendchasers.net').replace(/\/$/, '');

  // Wrapped first and most importantly: this is how a user with a dead secret gets back. If the
  // connect call itself fails on the stale credential, there is no route out of the broken state.
  const res = await withCredentialRecovery(uid, creds, (c) =>
    snaptrade.authentication.loginSnapTradeUser({
        userId: c.userId,
        userSecret: c.userSecret,
      broker: brokerSlug,
      connectionType: 'read',
      customRedirect: `${siteUrl}/app?brokerConnected=1`,
    }),
  );

  const data = res.data;
  if (!('redirectURI' in data) || !data.redirectURI) {
    // SnapTrade answers a refused connection with a detail payload rather than an HTTP error, and
    // this branch used to discard it — so "SnapTrade did not return a connection link" was all
    // anyone ever saw, whether the real reason was a plan limit, an unsupported broker, or an
    // expired secret. The reason is the whole value of the message.
    const detail = data as { detail?: string; code?: string | number; status_code?: number };
    console.error(
      `[broker-connect] SnapTrade refused a ${brokerSlug} connection for ${uid}:`,
      JSON.stringify(detail).slice(0, 500),
    );

    const reason = typeof detail.detail === 'string' ? detail.detail : '';
    throw new BrokerRequestError(
      reason
        ? `${brokerSlug} couldn\u2019t be connected: ${reason}`
        : 'SnapTrade did not return a connection link. Try again.',
      502,
    );
  }

  return { statusCode: 200, body: { redirectURI: data.redirectURI } };
}

async function handleStatus(uid: string): Promise<BrokerConnectResult> {
  // Status is never gated — someone who has downgraded still needs to see and disconnect what
  // they connected. The plan travels with the answer so the UI can say "1 of 2 used" without a
  // second round trip.
  const { tier, limits } = await resolveAccess(uid);
  const plan = { tier, brokers: limits.brokers, syncsPerDay: limits.syncsPerDay };

  const creds = await getCredsIfRegistered(uid);
  if (!creds) {
    return { statusCode: 200, body: { registered: false, accounts: [], plan } };
  }
  await recordBrokerConnectionState(uid, [], 0).catch(() => {});

  const snaptrade = getSnaptrade();
  const res = await withCredentialRecovery(uid, creds, (c) =>
    snaptrade.accountInformation.listUserAccounts({
      userId: c.userId,
      userSecret: c.userSecret,
    }),
  );

  const accounts = res.data.map((a) => ({
    id: a.id,
    name: a.name,
    institutionName: a.institution_name,
    authorizationId: a.brokerage_authorization,
    status: a.sync_status,
  }));

  await recordBrokerConnectionState(
    uid,
    [...new Set(accounts.map((a) => a.institutionName).filter((n): n is string => Boolean(n)))],
    accounts.length,
  );

  return { statusCode: 200, body: { registered: true, accounts, plan } };
}

async function handleSync(uid: string, accountId?: string, startDate?: string, endDate?: string): Promise<BrokerConnectResult> {
  if (!accountId) {
    throw new BrokerRequestError('accountId is required', 400);
  }

  const { tier, limits } = await resolveAccess(uid);
  assertBrokerSyncIncluded(tier, limits.brokers);

  const creds = await getCredsIfRegistered(uid);
  if (!creds) {
    throw new BrokerRequestError('No broker connected yet', 400);
  }

  // Counted before the pull, not after: a sync that fails halfway still cost the SnapTrade call
  // it was capped for, and counting afterwards would let a retry loop pull for free.
  const spend = await consumeDaily('sync', uid, limits.syncsPerDay);
  if (!spend.ok) {
    if (spend.reason === 'unavailable') {
      throw new BrokerRequestError('Sync is briefly unavailable. Try again in a moment.', 503);
    }
    if (spend.reason === 'not_included') {
      assertBrokerSyncIncluded(tier, 0);
    }
    throw new BrokerRequestError(
      `You've used ${limits.syncsPerDay === 1 ? "today's sync" : `all ${limits.syncsPerDay} of today's syncs`} on ${TIER_PLANS[tier].name}. Syncs reset at midnight UTC.`,
      429,
    );
  }

  try {
    return await pullActivities(uid, creds, accountId, startDate, endDate, spend.remaining, limits.syncsPerDay, tier);
  } catch (err) {
    if (isUpstreamOutage(err)) {
      // The user paid for a request nobody answered. Give it back before the error goes out, so
      // the remaining count on the response is the one they actually have.
      await refundDaily('sync', uid);
      console.warn(`[broker-connect] refunded a sync for ${uid} — upstream failure, not a rejected call.`);
      throw new BrokerSyncError(
        'Your broker could not be reached just now. This did not use one of your syncs — try again shortly.',
        503,
        spend.remaining + 1,
        limits.syncsPerDay,
      );
    }

    // SnapTrade answered and said no. The call happened, so the sync is spent — but the meter is
    // still told the truth, which is the half that was missing.
    throw new BrokerSyncError(
      err instanceof Error ? err.message : 'Sync failed',
      err instanceof BrokerRequestError ? err.statusCode : 502,
      spend.remaining,
      limits.syncsPerDay,
    );
  }
}

/** The pull itself, split out so handleSync can own the charge, the refund and the error shape. */
async function pullActivities(
  uid: string,
  creds: SnaptradeCreds,
  accountId: string,
  startDate: string | undefined,
  endDate: string | undefined,
  syncsRemaining: number,
  syncsPerDay: number,
  tier: Tier,
): Promise<BrokerConnectResult> {
  const snaptrade = getSnaptrade();
  const PAGE_SIZE = 1000;
  // Safety backstop only — not a real limit for anyone's trade history. Prevents a runaway loop if
  // SnapTrade's pagination metadata is ever malformed.
  const MAX_PAGES = 25;

  const activities: SnapTradeActivityLike[] = [];
  let total: number | undefined;
  let truncated = false;

  // Reassigned if the first page recovers a fresh secret, so the remaining pages use the working
  // credential rather than the one that was just rejected.
  let active = creds;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await withCredentialRecovery(uid, active, (c) => {
      active = c;
      return snaptrade.accountInformation.getAccountActivities({
        userId: c.userId,
        userSecret: c.userSecret,
        accountId,
        // Leaving startDate/endDate unset pulls SnapTrade's full known history for the account (its
        // own default) instead of an arbitrary recent window — syncing exists to backfill the
        // calendar with everything, not just what happened lately.
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
    });

    const batch = (res.data.data ?? []) as SnapTradeActivityLike[];
    activities.push(...batch);
    total = res.data.pagination?.total ?? total;

    if (batch.length < PAGE_SIZE) break; // last page reached
    if (page === MAX_PAGES - 1) truncated = true;
  }

  if (truncated) {
    console.warn(
      `[broker-connect] sync for account ${accountId} hit the ${MAX_PAGES * PAGE_SIZE}-activity safety cap; some older history may be missing from this sync.`,
    );
  }

  const trades = mapSnapTradeActivitiesToTrades(activities);

  return {
    statusCode: 200,
    body: {
      trades,
      activityCount: activities.length,
      totalActivityCount: total ?? activities.length,
      truncated,
      syncsRemaining,
      syncsPerDay,
      tier,
    },
  };
}

async function handleDisconnect(uid: string, authorizationId?: string): Promise<BrokerConnectResult> {
  if (!authorizationId) {
    throw new BrokerRequestError('authorizationId is required', 400);
  }

  const creds = await getCredsIfRegistered(uid);
  if (!creds) {
    return { statusCode: 200, body: { ok: true } };
  }

  const snaptrade = getSnaptrade();
  await snaptrade.connections.disableBrokerageAuthorization({
    authorizationId,
    userId: creds.userId,
    userSecret: creds.userSecret,
  });

  return { statusCode: 200, body: { ok: true } };
}

/**
 * True when the failure is Firestore being unable to serve us, not anything broker-related.
 *
 * RESOURCE_EXHAUSTED is the one that matters most: on the free tier it means the daily read quota
 * is spent, and every read fails for the rest of the day. It reads as total data loss from the
 * outside, so it needs to be named rather than swallowed into a generic 500.
 */
function isDatastoreUnavailable(err: unknown): boolean {
  const code = (err as { code?: string | number } | null)?.code;
  const message = err instanceof Error ? err.message.toUpperCase() : '';
  return (
    code === 8 ||
    code === 'resource-exhausted' ||
    code === 14 ||
    code === 'unavailable' ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('QUOTA') ||
    message.includes('DEADLINE_EXCEEDED')
  );
}

/**
 * Whether this caller is the site admin, read from config/admin — the same document the admin
 * user tools use.
 *
 * Only used to decide how much of a failure to explain. Never to grant access to anything.
 */
async function isSiteAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getAdminFirestore().doc('config/admin').get();
    return (snap.data() as { uid?: string } | undefined)?.uid === uid;
  } catch {
    return false;
  }
}

export async function handleBrokerConnectRequest(
  headers: IncomingHttpHeaders,
  body: BrokerConnectRequestBody,
): Promise<BrokerConnectResult> {
  if (!SNAPTRADE_CONFIGURED) {
    return {
      statusCode: 503,
      body: { error: 'Broker connect is not set up yet. Ask the site owner to add SnapTrade API keys.' },
    };
  }

  let callerUid: string | null = null;

  try {
    const uid = await assertCallerUid(headers);
    callerUid = uid;

    switch (body.action) {
      case 'connect':
        return await handleConnect(uid, body.broker);
      case 'status':
        return await handleStatus(uid);
      case 'sync':
        return await handleSync(uid, body.accountId, body.startDate, body.endDate);
      case 'disconnect':
        return await handleDisconnect(uid, body.authorizationId);
      default:
        throw new BrokerRequestError('Unknown action', 400);
    }
  } catch (err) {
    if (err instanceof BrokerSyncError) {
      return {
        statusCode: err.statusCode,
        body: {
          error: err.message,
          syncsRemaining: err.syncsRemaining,
          syncsPerDay: err.syncsPerDay,
        },
      };
    }

    if (err instanceof BrokerRequestError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[broker-connect] failed:', message);

    // Your broker credentials live in Firestore, so a Firestore outage or an exhausted quota
    // surfaces here as "broker connect failed" — which sends the owner hunting through SnapTrade
    // keys and connection settings for a problem that is nowhere near either. Telling the truth
    // about the cause is worth the extra branch; "please try again" is advice that cannot work
    // when the database is refusing reads.
    if (isDatastoreUnavailable(err)) {
      return {
        statusCode: 503,
        body: {
          error:
            'Your broker connection can\u2019t be read right now because the database is unavailable \u2014 ' +
            'this is not a problem with your broker, and nothing has been disconnected. Try again shortly.',
        },
      };
    }

    // Same reasoning as the datastore branch above: when the failure is upstream, "please try
    // again" is advice that cannot work, and it points the user at their own connection when
    // nothing about it is wrong.
    if (isUpstreamOutage(err)) {
      return {
        statusCode: 503,
        body: {
          error:
            'Your broker data provider (SnapTrade) is not responding right now. Nothing has been ' +
            'disconnected and none of your syncs have been used — this should clear on its own.',
        },
      };
    }

    /*
     * One sentence for every possible cause is what makes this path undebuggable from outside.
     * A rotated consumer key, a refused connection, a malformed id and a provider outage all
     * arrived here as "Broker connect request failed. Please try again." — three separate
     * investigations were spent recovering a reason the server already had in hand.
     *
     * The reason goes to the site admin only. It is upstream error text rather than anything
     * secret, but it is internal detail and the person who can act on it is the one running the
     * site. Everyone else keeps the plain sentence.
     */
    const detail = callerUid && (await isSiteAdmin(callerUid)) ? message.slice(0, 300) : undefined;

    return {
      statusCode: 500,
      body: { error: 'Broker connect request failed. Please try again.', ...(detail ? { detail } : {}) },
    };
  }
}
