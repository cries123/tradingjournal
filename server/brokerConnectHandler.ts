import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { getSnaptrade, resolveBrokerSlug, SNAPTRADE_CONFIGURED } from './snaptradeClient';
import { getAdminFirestore } from './firebaseAdmin';
import { mapSnapTradeActivitiesToTrades, type SnapTradeActivityLike } from './mapSnapTradeActivities';
import { BROKER_REGISTRY, isBrokerRegistryKey } from '../src/data/brokerRegistry';

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

async function getOrRegisterCreds(uid: string): Promise<SnaptradeCreds> {
  const ref = privateSnaptradeDoc(uid);
  const snap = await ref.get();
  const existing = (snap.data() ?? null) as SnaptradeCreds | null;
  if (existing?.userSecret) return existing;

  const snaptrade = getSnaptrade();
  const res = await snaptrade.authentication.registerSnapTradeUser({ userId: uid });
  const creds: SnaptradeCreds = { userId: uid, userSecret: res.data.userSecret! };
  await ref.set(creds);
  return creds;
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

async function handleConnect(uid: string, broker?: string): Promise<BrokerConnectResult> {
  if (!isBrokerRegistryKey(broker)) {
    const keys = BROKER_REGISTRY.map((b) => b.key).join(', ');
    throw new BrokerRequestError(`Unsupported broker. Use one of: ${keys}.`, 400);
  }

  const creds = await getOrRegisterCreds(uid);
  const snaptrade = getSnaptrade();
  const brokerSlug = await resolveBrokerSlug(broker);
  const siteUrl = (process.env.SITE_URL || 'https://trendchasers.net').replace(/\/$/, '');

  const res = await snaptrade.authentication.loginSnapTradeUser({
    userId: creds.userId,
    userSecret: creds.userSecret,
    broker: brokerSlug,
    connectionType: 'read',
    customRedirect: `${siteUrl}/app?brokerConnected=1`,
  });

  const data = res.data;
  if (!('redirectURI' in data) || !data.redirectURI) {
    throw new BrokerRequestError('SnapTrade did not return a connection link. Try again.', 502);
  }

  return { statusCode: 200, body: { redirectURI: data.redirectURI } };
}

async function handleStatus(uid: string): Promise<BrokerConnectResult> {
  const creds = await getCredsIfRegistered(uid);
  if (!creds) {
    return { statusCode: 200, body: { registered: false, accounts: [] } };
  }
  await recordBrokerConnectionState(uid, [], 0).catch(() => {});

  const snaptrade = getSnaptrade();
  const res = await snaptrade.accountInformation.listUserAccounts({
    userId: creds.userId,
    userSecret: creds.userSecret,
  });

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

  return { statusCode: 200, body: { registered: true, accounts } };
}

async function handleSync(uid: string, accountId?: string, startDate?: string, endDate?: string): Promise<BrokerConnectResult> {
  if (!accountId) {
    throw new BrokerRequestError('accountId is required', 400);
  }

  const creds = await getCredsIfRegistered(uid);
  if (!creds) {
    throw new BrokerRequestError('No broker connected yet', 400);
  }

  const snaptrade = getSnaptrade();
  const PAGE_SIZE = 1000;
  // Safety backstop only — not a real limit for anyone's trade history. Prevents a runaway loop if
  // SnapTrade's pagination metadata is ever malformed.
  const MAX_PAGES = 25;

  const activities: SnapTradeActivityLike[] = [];
  let total: number | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await snaptrade.accountInformation.getAccountActivities({
      userId: creds.userId,
      userSecret: creds.userSecret,
      accountId,
      // Leaving startDate/endDate unset pulls SnapTrade's full known history for the account (its own
      // default) instead of an arbitrary recent window — syncing exists to backfill the calendar with
      // everything, not just what happened lately.
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
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
    body: { trades, activityCount: activities.length, totalActivityCount: total ?? activities.length, truncated },
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

  try {
    const uid = await assertCallerUid(headers);

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

    return { statusCode: 500, body: { error: 'Broker connect request failed. Please try again.' } };
  }
}
