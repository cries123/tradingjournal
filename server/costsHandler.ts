import { assertCallerIsAdmin, AdminRequestError, getBearerToken } from './adminAuth';
import { getAdminFirestore } from './firebaseAdmin';
import { logServerError } from './errorReports';
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
  /** Monthly recurring revenue from active paid entitlements, as it stands today. */
  mrrNow: number;
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

/** Revenue is current-state only: what the active subscriptions bill today. */
async function readRevenueNow(): Promise<{ mrr: number; charges: number }> {
  const { TIER_PLANS } = await import('../src/config/tiers');
  const snap = await getAdminFirestore().collection('entitlements').get();

  let mrr = 0;
  let charges = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { tier?: string; status?: string; source?: string };
    if (data.status !== 'active' || data.source !== 'purchase') continue;
    const plan = TIER_PLANS[data.tier as keyof typeof TIER_PLANS];
    if (!plan || plan.price <= 0) continue;
    mrr += plan.price;
    charges += 1;
  }
  return { mrr, charges };
}

async function readConnectedNow(): Promise<number> {
  const snap = await getAdminFirestore().collection('brokerConnections').get();
  return snap.docs.filter((d) => (d.data() as { connected?: boolean }).connected !== false).length;
}

export async function buildCostReport(): Promise<CostReport> {
  const db = getAdminFirestore();
  const thisMonth = monthKey(new Date());
  const from = launchMonth() || EARLIEST_MONTH;

  const [{ mrr, charges }, connectedNow] = await Promise.all([
    readRevenueNow().catch(() => ({ mrr: 0, charges: 0 })),
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
      const counts: UsageCounts = {
        ...raw.counts,
        // Revenue and charge count are only knowable for the current month — nothing snapshotted
        // them historically. Older months carry zero here rather than today's figure pretended
        // backwards, which would make every past month look identically profitable.
        charges: partial ? charges : 0,
        revenue: partial ? mrr : 0,
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
