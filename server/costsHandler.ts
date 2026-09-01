import { assertCallerIsAdmin, AdminRequestError, getBearerToken } from './adminAuth';
import { getAdminFirestore } from './firebaseAdmin';
import { logServerError } from './errorReports';
import { readMonthRevenue } from './billingLedger';
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
  topUsers: { uid: string; aiMessages: number; syncs: number; cost: number }[];
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
async function readSubscriptionRunRate(): Promise<{ mrr: number; subscribers: number }> {
  const { TIER_PLANS } = await import('../src/config/tiers');
  const snap = await getAdminFirestore().collection('entitlements').get();

  let mrr = 0;
  let subscribers = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      tier?: string;
      status?: string;
      source?: string;
      creemSubscriptionId?: string;
    };
    if (data.status !== 'active') continue;
    if (data.source !== 'purchase') continue;
    if (!data.creemSubscriptionId) continue;

    const plan = TIER_PLANS[data.tier as keyof typeof TIER_PLANS];
    if (!plan || plan.price <= 0) continue;
    mrr += plan.price;
    subscribers += 1;
  }
  return { mrr, subscribers };
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

export async function buildCostReport(): Promise<CostReport> {
  const db = getAdminFirestore();
  const thisMonth = monthKey(new Date());
  const from = launchMonth() || EARLIEST_MONTH;

  const [{ mrr, subscribers }, connectedNow] = await Promise.all([
    readSubscriptionRunRate().catch(() => ({ mrr: 0, subscribers: 0 })),
    readConnectedNow().catch(() => 0),
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
      const collected = await readMonthRevenue(month).catch(() => ({ revenue: 0, charges: 0 }));

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
      cost: row.aiMessages * COST_RATES.aiMessage + row.syncs * COST_RATES.syncCall,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return {
    months: months.reverse(),
    rates: COST_RATES,
    connectedNow,
    mrrNow: mrr,
    subscribers,
    topUsers: ranked,
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
    logServerError('admin-costs', err);
    return { statusCode: 500, body: { error: 'Could not build the cost report' } };
  }
}
