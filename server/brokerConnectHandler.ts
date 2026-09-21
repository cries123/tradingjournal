import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { logServerError } from './errorReports';
import { getSnaptrade, resolveBrokerSlug, SNAPTRADE_CONFIGURED } from './snaptradeClient';
import { getAdminFirestore } from './firebaseAdmin';
import { mapSnapTradeActivities, type SnapTradeActivityLike } from './mapSnapTradeActivities';
import type { ParsedTradeInput } from '../src/types';
import { BROKER_REGISTRY, brokerRegistryEntry, isBrokerRegistryKey } from '../src/data/brokerRegistry';
import {
  BROKER_STATUS_DOC,
  parseBrokerStatusOverrides,
  resolveBrokerStatus,
} from '../src/data/brokerStatusOverrides';
import { readEntitlement, resolveAccess } from './entitlements';
import { brokerageKey, brokerageOwner, claimBrokerage } from './trialGuards';
import { compIsLive } from '../src/config/accessExtension';
import { consumeDaily, refundDaily } from './usage';
import { recordJournalEvent } from './journalEvents';
import { describeHttpError, isRejectedCredential, isUpstreamOutage } from './upstreamErrors';
import { brokersUnlimited, lowestTierWith, TIER_PLANS, type Tier } from '../src/config/tiers';

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
function assertBrokerSyncIncluded(_tier: Tier, brokers: number): void {
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
  /** Bonus syncs still banked, already counted inside syncsRemaining. */
  syncCredits: number;

  constructor(message: string, statusCode: number, syncsRemaining: number, syncsPerDay: number, syncCredits = 0) {
    super(message, statusCode);
    this.name = 'BrokerSyncError';
    this.syncsRemaining = syncsRemaining;
    this.syncsPerDay = syncsPerDay;
    this.syncCredits = syncCredits;
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

/**
 * The admin's broker availability overrides, read fresh on each connect attempt.
 *
 * Not cached: the whole point of moving this out of the registry is that it changes while the app
 * is running, and a cached value would mean flipping a broker back on still needs a deploy — just
 * a slower one. It is a single document read on an action that already makes several network
 * calls, so the cost is noise.
 *
 * Unreadable means "no overrides", never "everything is down": a Firestore blip must not take
 * every broker offline.
 */
async function readBrokerStatusOverrides() {
  try {
    const snap = await getAdminFirestore().doc(BROKER_STATUS_DOC).get();
    return parseBrokerStatusOverrides(snap.data()?.brokers);
  } catch (err) {
    console.error('[broker-connect] could not read broker status overrides:', err);
    return {};
  }
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
  if (registryEntry) {
    const status = resolveBrokerStatus(registryEntry, await readBrokerStatusOverrides());
    if (status?.kind === 'down') {
      throw new BrokerRequestError(status.message, 503);
    }
  }

  const { tier, limits } = await resolveAccess(uid);
  assertBrokerSyncIncluded(tier, limits.brokers);

  const creds = await getOrRegisterCreds(uid);

  /*
   * Only counted when there is a ceiling to count against.
   *
   * Every paid plan is unlimited now — SnapTrade bills per person, not per connection — so this is
   * one SnapTrade round trip saved on every connect for every paying user. The branch stays
   * because the free plan still has a ceiling of zero, and because a future plan with a real cap
   * should not need this rediscovered.
   */
  if (!brokersUnlimited(limits)) {
    // Checked against live connections rather than a stored count, because a connection can also
    // be removed from the broker's own side and a stale counter would lock someone out of a slot
    // they no longer occupy.
    const existing = await countConnections(creds).catch(() => 0);
    if (existing >= limits.brokers) {
      throw new BrokerRequestError(
        limits.brokers === 1
          ? `${TIER_PLANS[tier].name} includes one broker connection, and you already have one. Disconnect it first, or upgrade for more.`
          : `${TIER_PLANS[tier].name} includes ${limits.brokers} broker connections and you're using all of them. Disconnect one first, or upgrade for more.`,
        402,
      );
    }
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

/**
 * One free trial per real brokerage account.
 *
 * The account ids SnapTrade issues are per-user, so they say nothing across two signups — link
 * the same Schwab account under a second login and every id differs. The masked account number
 * does not change, and with the institution beside it that pair identifies the actual account
 * behind two logins. Both are hashed; what is stored can be compared but not read.
 *
 * Enforced ONLY against a trial. A paying customer who opens a second account, or comes back
 * after deleting one, must never be told their own brokerage is spoken for — the whole point is
 * to stop free weeks being farmed, not to stop anybody paying us.
 */
async function assertBrokerageNotAlreadyTrialled(
  uid: string,
  accounts: { institutionName?: string | null; number?: string | null }[],
  onTrial: boolean,
): Promise<void> {
  for (const account of accounts) {
    const key = brokerageKey(account.institutionName ?? null, account.number ?? null);
    if (!key) continue;

    const owner = await brokerageOwner(key);
    if (!owner) {
      await claimBrokerage(key, uid);
      continue;
    }
    if (owner === uid) continue;

    if (onTrial) {
      throw new BrokerRequestError(
        'This brokerage account has already been used with another Trend Chasers account, so it is not eligible for a second free trial. Subscribe to any paid plan and it will sync straight away.',
        409,
      );
    }
  }
}

/** True when what is granting this account its plan right now is a self-serve trial. */
async function isOnTrial(uid: string): Promise<boolean> {
  try {
    const record = await readEntitlement(uid);
    return record?.comp?.trial === true && compIsLive(record.comp, Date.now());
  } catch {
    // Unreadable means "assume they are paying". Blocking a real customer over a Firestore blip
    // is the more expensive mistake by a distance.
    return false;
  }
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

  /*
   * Checked before the allowance is spent, so a refusal never costs somebody a sync.
   *
   * The listing is one call SnapTrade does not bill per use, unlike the activity pull below.
   */
  const onTrial = await isOnTrial(uid);
  const listed = await withCredentialRecovery(uid, creds, (c) =>
    getSnaptrade().accountInformation.listUserAccounts({ userId: c.userId, userSecret: c.userSecret }),
  );
  await assertBrokerageNotAlreadyTrialled(
    uid,
    listed.data.map((a) => ({ institutionName: a.institution_name, number: a.number })),
    onTrial,
  );

  // Counted before the pull, not after: a sync that fails halfway still cost the SnapTrade call
  // it was capped for, and counting afterwards would let a retry loop pull for free.
  /* Named here while the account list is still in hand, so the history row can say which
     connection a sync belonged to — a two-account trader cannot read a log that does not. */
  const syncedInstitution =
    listed.data.find((a) => a.id === accountId)?.institution_name ?? null;

  const spend = await consumeDaily('sync', uid, limits.syncsPerDay);
  if (!spend.ok) {
    if (spend.reason === 'unavailable') {
      throw new BrokerRequestError('Sync is briefly unavailable. Try again in a moment.', 503);
    }
    if (spend.reason === 'not_included') {
      assertBrokerSyncIncluded(tier, 0);
    }
    throw new BrokerRequestError(
      `You've used ${limits.syncsPerDay === 1 ? "today's sync" : `all ${limits.syncsPerDay} of today's syncs`} on ${TIER_PLANS[tier].name}. Syncs reset at midnight Eastern.`,
      429,
    );
  }

  try {
    return await pullActivities(uid, creds, accountId, startDate, endDate, spend.remaining, limits.syncsPerDay, tier, spend.credits, syncedInstitution);
  } catch (err) {
    if (isUpstreamOutage(err)) {
      // The user paid for a request nobody answered. Give it back before the error goes out, so
      // the remaining count on the response is the one they actually have.
      await refundDaily('sync', uid, spend.source);
      console.warn(`[broker-connect] refunded a sync for ${uid} — upstream failure, not a rejected call.`);
      throw new BrokerSyncError(
        'Your broker could not be reached just now. This did not use one of your syncs — try again shortly.',
        503,
        spend.remaining + 1,
        limits.syncsPerDay,
        spend.source === 'credit' ? spend.credits + 1 : spend.credits,
      );
    }

    // SnapTrade answered and said no. The call happened, so the sync is spent — but the meter is
    // still told the truth, which is the half that was missing.
    throw new BrokerSyncError(
      err instanceof Error ? err.message : 'Sync failed',
      err instanceof BrokerRequestError ? err.statusCode : 502,
      spend.remaining,
      limits.syncsPerDay,
      spend.credits,
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
  syncCredits: number,
  institution: string | null,
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

  const { trades, diagnostics } = mapSnapTradeActivities(activities);

  /*
   * What this sync actually produced, recorded before the response goes out.
   *
   * syncUsage counts how many syncs were spent and nothing about what any of them returned, so
   * "I synced and nothing imported" was unanswerable — the trade total cannot tell an empty
   * sync from one that worked. Awaited rather than fired off: the write never throws, and a
   * floating promise here would reject into the global handler as minified frames.
   */
  await recordJournalEvent(uid, {
    type: 'sync',
    at: new Date().toISOString(),
    sync: {
      accountId,
      institution,
      activityCount: activities.length,
      tradesReturned: trades.length,
      unmatchedCloses: diagnostics.unmatchedOptionCloses.length,
      ignored: Object.values(diagnostics.ignored).reduce((a, b) => a + b, 0),
      ignoredByType: diagnostics.ignored,
      truncated,
      syncsRemaining,
    },
  });

  return {
    statusCode: 200,
    body: {
      trades,
      // What the matcher could not account for, so the screen can say why the journal's total may
      // not equal the broker's rather than leaving the trader to find the gap themselves.
      unmatchedCloses: diagnostics.unmatchedOptionCloses.length,
      assumedShorts: diagnostics.assumedShorts.length,
      inferredOrderDays: diagnostics.inferredOrderDays.length,
      ignored: diagnostics.ignored,
      negativeFees: diagnostics.negativeFees,
      activityCount: activities.length,
      totalActivityCount: total ?? activities.length,
      truncated,
      syncsRemaining,
      syncsPerDay,
      syncCredits,
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

  /*
   * deleteConnection, not disableBrokerageAuthorization.
   *
   * The two read alike and are not. SnapTrade's own docs on disable: "This should only be used for
   * testing a reconnect flow, and never used on production connections... available on test keys.
   * If you would like it enabled on production keys as well, please contact support as it is
   * disabled by default." It forces the connection into a broken state and fires a CONNECTION_BROKEN
   * webhook — it simulates a failure rather than removing anything.
   *
   * It worked here for as long as this app ran on test keys, and started answering 403 code 1141,
   * "Feature is not enabled for this customer or this connection", the day it moved to production.
   *
   * delete is the operation Disconnect means: it removes the connection and the account and holdings
   * data behind it. It is asynchronous — a 200 says the deletion is queued — so the connection can
   * still appear in the next status read for a moment, which is why the client refreshes rather
   * than assuming.
   */
  const snaptrade = getSnaptrade();
  await withCredentialRecovery(uid, creds, (c) =>
    snaptrade.connections.deleteConnection({
      connectionId: authorizationId,
      userId: c.userId,
      userSecret: c.userSecret,
    }),
  );

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
 * The most informative description of a failure that can be assembled.
 *
 * The SnapTrade SDK is axios-based, and an axios error's `message` is "Request failed with status
 * code 403" followed by a dump of the response HEADERS. The reason is in the response BODY, which
 * that string never reaches — the first version of this truncated mid-header-dump and showed a
 * date, a content-type and a server name, which is everything except the answer.
 */
function failureDetail(err: unknown, fallback: string): string {
  const { status, body, method, url } = describeHttpError(err);
  const where = method && url ? `${method} ${url}` : '';
  const parts = [status ? `HTTP ${status}` : '', where, body].filter(Boolean);
  return (parts.length ? parts.join(' — ') : fallback).slice(0, 600);
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

/**
 * Pulls and matches every account's recent activity for one user, for the automatic import.
 *
 * Deliberately inside this module rather than beside the scheduled job: registering, recovering a
 * rejected secret, paging the activity feed and matching round trips are all solved here, and a
 * second implementation of any of them would be a second set of bugs. What it does NOT do is any
 * of the gating a manual sync does — no allowance is consumed and no trial guard runs, because
 * nobody pressed anything. The caller records the cost separately.
 *
 * Returns the mapped trades unwritten. Dedupe and the journal write belong to the caller, which is
 * the only part of this that differs from a manual sync.
 */
export async function pullRecentActivityForUser(
  uid: string,
  startDate: string,
  /**
   * How many connected accounts to pull.
   *
   * Connections are unlimited on every paid plan because SnapTrade bills per person; activity
   * pulls are billed per call, so the two facts have to be reconciled somewhere and this is where.
   * The caller sets it — see accountsPerRun in autoSync.ts.
   */
  maxAccounts = Infinity,
): Promise<{ accounts: number; trades: ParsedTradeInput[]; pulls: number; skippedAccounts: number }> {
  const creds = await getCredsIfRegistered(uid);
  if (!creds) return { accounts: 0, trades: [], pulls: 0, skippedAccounts: 0 };

  const snaptrade = getSnaptrade();
  let active = creds;

  const listed = await withCredentialRecovery(uid, active, (c) => {
    active = c;
    return snaptrade.accountInformation.listUserAccounts({ userId: c.userId, userSecret: c.userSecret });
  });

  const trades: ParsedTradeInput[] = [];
  let pulls = 0;

  for (const account of listed.data) {
    if (!account.id) continue;
    if (pulls >= maxAccounts) break;

    const res = await withCredentialRecovery(uid, active, (c) => {
      active = c;
      return snaptrade.accountInformation.getAccountActivities({
        userId: c.userId,
        userSecret: c.userSecret,
        accountId: account.id,
        // A window, not the whole history: this is topping up a journal that a manual sync already
        // backfilled, and a full pull every morning would be slower and no more complete.
        startDate,
        limit: 1000,
      });
    });
    pulls += 1;

    const activities = (res.data.data ?? []) as SnapTradeActivityLike[];
    /*
     * Matched per account, never across accounts.
     *
     * The matcher pairs opens with closes by contract, and two accounts holding the same contract
     * would otherwise have a buy in one closed by a sell in the other — a fabricated round trip
     * with a P&L that never happened to anybody.
     */
    trades.push(...mapSnapTradeActivities(activities).trades);
  }

  return {
    accounts: listed.data.length,
    trades,
    pulls,
    skippedAccounts: Math.max(0, listed.data.length - pulls),
  };
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
          syncCredits: err.syncCredits,
        },
      };
    }

    if (err instanceof BrokerRequestError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[broker-connect] failed:', message);

    /*
     * Everything above this line is expected control flow — a spent sync allowance, a bad request,
     * a broker that needs reconnecting. Anything that gets here is a failure nobody planned for,
     * which is exactly the class that used to be discovered only when a user wrote in. Recorded,
     * not awaited: the user is owed a response, not a wait on a diagnostic.
     */
    logServerError('broker-connect', err, { uid: callerUid });

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
    const detail = callerUid && (await isSiteAdmin(callerUid)) ? failureDetail(err, message) : undefined;

    return {
      statusCode: 500,
      body: { error: 'Broker connect request failed. Please try again.', ...(detail ? { detail } : {}) },
    };
  }
}
