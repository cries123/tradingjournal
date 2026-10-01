import { assertCallerIsAdmin, AdminRequestError, getBearerToken } from './adminAuth';
import { getAdminFirestore } from './firebaseAdmin';
import { logServerError } from './errorReports';
import { readMonthRevenue } from './billingLedger';
import { getAdminAuth } from './firebaseAdmin';
import {
  COST_RATES,
  launchMonth,
  priceUsage,
  type CostBreakdown,
  type CostRates,
  type UsageCounts,
} from '../src/config/costs';
import type { IncomingHttpHeaders } from 'http';

/**
 * What the product cost to run, month by month, back to launch.
 *
 * Every number here is reconstructed from counters the app already keeps: usage is stored as one
 * document per user per day and nothing ever deletes them, so the history was sitting there the
 * whole time waiting to be added up.
 *
 * Completed months are cached, because they cannot change. Recomputing six months of daily
 * documents on every visit to the admin panel would cost more in Firestore reads than the AI
 * spending it is reporting on — a cost dashboard that is itself a cost is a bad joke to ship.
 */

const USAGE_COLLECTIONS = {
  aiMessages: 'aiUsage',
  takeaways: 'takeawayUsage',
  syncs: 'syncUsage',
} as const;

const CACHE_COLLECTION = 'adminCostMonths';

/** Nothing before this is worth showing — the product had no paid users to bill for. */
const EARLIEST_MONTH = '2025-01';

export interface MonthCosts {
  month: string;
  counts: UsageCounts;
  breakdown: CostBreakdown;
  /** True while the month is still running, so the UI can say "so far" rather than a total. */
  partial: boolean;
}

export interface CostReport {
  months: MonthCosts[];
  rates: CostRates;
  /** Brokerage connections live right now — the only connection figure that can be known, since
   *  connection state is current-state-only and was never snapshotted per month. */
  connectedNow: number;
  /** Run rate from subscriptions actually paid for on Creem. Hand-granted tiers are excluded. */
  mrrNow: number;
  /** How many people that run rate comes from. */
  subscribers: number;
  /**
   * Subscriptions inside their free trial, excluded from the two numbers above.
   *
   * A trial is an active subscription with a real id, so it used to be counted at full price —
   * run rate that nobody had paid, next to a collected figure from the ledger that correctly said
   * zero. Reported rather than silently dropped, because "why is run rate lower than the plans I
   * can see" is the next question.
   */
  onTrial: number;
  topUsers: { uid: string; aiMessages: number; syncs: number; cost: number }[];
  /** Who bought what, newest first. Straight from the ledger, so it is money, not entitlement. */
  purchases: { uid: string; email: string; tier: string; amount: number; at: string }[];
  /** Set when a month could not be read, so a low total is never mistaken for a cheap month. */
  warning: string | null;
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Every month from `from` to now, inclusive, oldest first. */
function monthsSince(from: string): string[] {
  const out: string[] = [];
  const now = monthKey(new Date());
  const [y, m] = from.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, 1));

  while (monthKey(cursor) <= now && out.length < 60) {
    out.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

interface RawMonth {
  counts: Pick<UsageCounts, 'aiMessages' | 'takeaways' | 'syncs' | 'syncingUsers'>;
  perUser: Map<string, { aiMessages: number; syncs: number }>;
}

/**
 * Add up one month of usage documents.
 *
 * The `day` field is a YYYY-MM-DD string, so a month is a range query on one field — which rides
 * Firestore's automatic single-field index and needs nothing built by hand in the console.
 */
async function readMonth(month: string): Promise<RawMonth> {
  const db = getAdminFirestore();
  const start = `${month}-01`;
  const end = `${month}-32`; // string compare: sorts after any real day in the month

  const counts = { aiMessages: 0, takeaways: 0, syncs: 0, syncingUsers: 0 };
  const perUser = new Map<string, { aiMessages: number; syncs: number }>();
  const syncingUsers = new Set<string>();

  for (const [key, collection] of Object.entries(USAGE_COLLECTIONS) as [
    keyof typeof USAGE_COLLECTIONS,
    string,
  ][]) {
    const snap = await db
      .collection(collection)
      .where('day', '>=', start)
      .where('day', '<=', end)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() as { uid?: string; count?: number };
      const n = typeof data.count === 'number' && data.count > 0 ? data.count : 0;
      if (n === 0) continue;

      counts[key] += n;

      const uid = data.uid;
      if (!uid) continue;

      if (key === 'syncs') syncingUsers.add(uid);
      if (key === 'takeaways') continue; // not per-user interesting; it is everybody, always

      const row = perUser.get(uid) ?? { aiMessages: 0, syncs: 0 };
      if (key === 'aiMessages') row.aiMessages += n;
      if (key === 'syncs') row.syncs += n;
      perUser.set(uid, row);
    }
  }

  counts.syncingUsers = syncingUsers.size;
  return { counts, perUser };
}

/**
 * The run rate from subscriptions somebody is actually paying for.
 *
 * Three conditions, and the third is the one that matters. A hand-granted tier is written with
 * source 'admin' and bills nothing — but clearing a grant hands the record back to billing by
 * setting source to 'purchase', so source alone would count a grandfathered account as revenue.
 * A real Creem subscription always carries its subscription id; a granted one never does. That is
 * the test for "did money change hands".
 *
 * This is a RATE — what the active subscriptions bill per month — not what was collected. What was
 * collected comes from the ledger.
 */
async function readSubscriptionRunRate(): Promise<{ mrr: number; subscribers: number; onTrial: number }> {
  const { TIER_PLANS } = await import('../src/config/tiers');
  const snap = await getAdminFirestore().collection('entitlements').get();
  const nowIso = new Date().toISOString();

  let mrr = 0;
  let subscribers = 0;
  let onTrial = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      tier?: string;
      status?: string;
      source?: string;
      creemSubscriptionId?: string;
      trialEndsAt?: string;
    };
    if (data.status !== 'active') continue;
    if (data.source !== 'purchase') continue;
    if (!data.creemSubscriptionId) continue;

    /*
     * A running trial is not run rate.
     *
     * A trialling subscription is status active with a real subscription id — creemClient maps
     * 'trialing' to active on purpose — so every live trial was counted here at full list price and
     * as a paid subscriber, while the ledger beside it correctly booked the $0. The two tiles
     * disagreed by the price of a plan per trial, and resolved themselves a week later either way,
     * which is the kind of error that is never caught because it is never there when you look.
     *
     * Compared as ISO strings rather than parsed: these are the dates the webhook stored verbatim,
     * and a string compare cannot throw on a value Creem formatted unexpectedly.
     */
    if (typeof data.trialEndsAt === 'string' && data.trialEndsAt > nowIso) {
      onTrial += 1;
      continue;
    }

    const plan = TIER_PLANS[data.tier as keyof typeof TIER_PLANS];
    if (!plan || plan.price <= 0) continue;
    mrr += plan.price;
    subscribers += 1;
  }
  return { mrr, subscribers, onTrial };
}

/**
 * People with a live brokerage connection — the only ones SnapTrade bills for.
 *
 * Having a plan that ALLOWS a connection costs nothing; SnapTrade charges per connected user. Rows
 * written under different API credentials are discarded, because a connection under the old test
 * client is not a connection you are being billed for now.
 */
async function readConnectedNow(): Promise<number> {
  const clientId = process.env.SNAPTRADE_CLIENT_ID ?? '';
  const snap = await getAdminFirestore().collection('brokerConnections').get();

  return snap.docs.filter((d) => {
    const data = d.data() as { connected?: boolean; clientId?: string };
    if (data.connected !== true) return false;
    return !clientId || !data.clientId || data.clientId === clientId;
  }).length;
}

/**
 * Recent purchases, with a name attached.
 *
 * The ledger stores a uid because that is what the webhook has; a uid is useless to read. Emails
 * are looked up in one batched call rather than one per row.
 */
async function readPurchases(limit = 50) {
  const snap = await getAdminFirestore()
    .collection('billingCharges')
    .orderBy('at', 'desc')
    .limit(limit)
    .get();

  const rows = snap.docs.map((d) => {
    const data = d.data() as { uid?: string; tier?: string; amount?: number; at?: string };
    return {
      uid: data.uid ?? '',
      tier: data.tier ?? 'unknown',
      amount: typeof data.amount === 'number' ? data.amount : 0,
      at: data.at ?? '',
      email: '',
    };
  });

  const uids = [...new Set(rows.map((r) => r.uid).filter(Boolean))].slice(0, 100);
  if (uids.length === 0) return rows;

  try {
    const found = await getAdminAuth().getUsers(uids.map((uid) => ({ uid })));
    const byUid = new Map(found.users.map((u) => [u.uid, u.email ?? '']));
    for (const row of rows) row.email = byUid.get(row.uid) ?? '';
  } catch {
    // A deleted account has no email left to show. The uid still identifies the sale.
  }

  return rows;
}

export async function buildCostReport(): Promise<CostReport> {
  const db = getAdminFirestore();
  const thisMonth = monthKey(new Date());
  const from = launchMonth() || EARLIEST_MONTH;

  const [{ mrr, subscribers, onTrial }, connectedNow, purchases] = await Promise.all([
    readSubscriptionRunRate().catch(() => ({ mrr: 0, subscribers: 0, onTrial: 0 })),
    readConnectedNow().catch(() => 0),
    readPurchases().catch(() => []),
  ]);

  const months: MonthCosts[] = [];
  const topUsers = new Map<string, { aiMessages: number; syncs: number }>();
  let warning: string | null = null;

  for (const month of monthsSince(from)) {
    const partial = month === thisMonth;
    const cacheRef = db.doc(`${CACHE_COLLECTION}/${month}`);

    try {
      if (!partial) {
        const cached = await cacheRef.get();
        const data = cached.data() as { counts?: UsageCounts } | undefined;
        if (data?.counts) {
          months.push({
            month,
            counts: data.counts,
            breakdown: priceUsage(data.counts, COST_RATES),
            partial: false,
          });
          continue;
        }
      }

      const raw = await readMonth(month);
      // Real money, from the ledger the webhook writes — not the run rate, and not today's figure
      // pretended backwards. Months before the ledger existed read zero, which is honest: nothing
      // recorded them.
      /*
       * NOT caught here. A failed ledger read must not become a cached zero.
       *
       * This swallowed the failure into { revenue: 0, charges: 0 }, which then flowed into the month
       * row and — because a completed month is cached permanently, with no TTL and nothing that ever
       * re-reads it — froze that month's revenue at $0 for good. One transient Firestore error or a
       * missing index on a range query, and a month that earned money reads as a month that earned
       * nothing, every time the panel is opened afterwards.
       *
       * Letting it throw hands the month to the catch below, which already logs, sets `warning`, and
       * skips both the table row and the cache write — the behaviour this wanted all along.
       */
      const collected = await readMonthRevenue(month);

      const counts: UsageCounts = {
        ...raw.counts,
        /*
         * SnapTrade bills per person who HAS a connection, so someone whose plan merely allows one
         * costs nothing. For the month in progress that is the live connection count; for a past
         * month, connection state was never snapshotted, so the people who ran at least one sync
         * are the floor. Whichever is larger, since a user can connect and sync, or sync and then
         * disconnect, and either way the dollar was spent.
         */
        syncingUsers: partial
          ? Math.max(connectedNow, raw.counts.syncingUsers)
          : raw.counts.syncingUsers,
        charges: collected.charges,
        revenue: collected.revenue,
      };

      months.push({ month, counts, breakdown: priceUsage(counts, COST_RATES), partial });

      for (const [uid, row] of raw.perUser) {
        const existing = topUsers.get(uid) ?? { aiMessages: 0, syncs: 0 };
        topUsers.set(uid, {
          aiMessages: existing.aiMessages + row.aiMessages,
          syncs: existing.syncs + row.syncs,
        });
      }

      // Only completed months are worth caching; a partial one is wrong tomorrow.
      if (!partial) {
        await cacheRef.set({ month, counts, cachedAt: new Date().toISOString() }).catch(() => {});
      }
    } catch (err) {
      console.error(`[costs] month ${month} failed:`, err);
      warning = `Some months could not be read, so totals are low. (${month})`;
    }
  }

  const ranked = [...topUsers.entries()]
    .map(([uid, row]) => ({
      uid,
      ...row,
      // Assistant messages only: syncs are free (see priceUsage), so adding them here would rank
      // the heaviest syncers as the most expensive users when they cost the same as everybody else.
      cost: row.aiMessages * COST_RATES.aiMessage,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return {
    months: months.reverse(),
    rates: COST_RATES,
    connectedNow,
    mrrNow: mrr,
    subscribers,
    onTrial,
    topUsers: ranked,
    purchases,
    warning,
  };
}

export async function handleCostsRequest(
  headers: IncomingHttpHeaders,
): Promise<{ statusCode: number; body: unknown }> {
  const token = getBearerToken(headers);
  if (!token) return { statusCode: 401, body: { error: 'Missing credentials' } };

  try {
    await assertCallerIsAdmin(token);
  } catch (err) {
    const status = err instanceof AdminRequestError ? err.statusCode : 401;
    return { statusCode: status, body: { error: 'Forbidden' } };
  }

  try {
    return { statusCode: 200, body: await buildCostReport() };
  } catch (err) {
    console.error('[costs] report failed:', err);
    await logServerError('admin-costs', err);
    return { statusCode: 500, body: { error: 'Could not build the cost report' } };
  }
}
