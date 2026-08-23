import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { getSnaptrade, resolveBrokerSlug, SNAPTRADE_CONFIGURED } from './snaptradeClient';
import { getAdminFirestore } from './firebaseAdmin';
import { mapSnapTradeActivitiesToTrades, type SnapTradeActivityLike } from './mapSnapTradeActivities';

export type SupportedBroker = 'SCHWAB' | 'ROBINHOOD';

export type BrokerConnectAction = 'connect' | 'status' | 'sync' | 'disconnect';

export interface BrokerConnectRequestBody {
  action: BrokerConnectAction;
  broker?: SupportedBroker;
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

async function handleConnect(uid: string, broker?: SupportedBroker): Promise<BrokerConnectResult> {
  if (broker !== 'SCHWAB' && broker !== 'ROBINHOOD') {
    throw new BrokerRequestError('Unsupported broker. Use SCHWAB or ROBINHOOD.', 400);
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
    return { statusCode: 500, body: { error: 'Broker connect request failed. Please try again.' } };
  }
}
