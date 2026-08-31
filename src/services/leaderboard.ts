import {
  collection,
  deleteDoc,
  doc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Trade } from '../types';
import { computeStats } from '../utils/stats';
import { getFirebaseDb } from '../lib/firebase';
import { stripUndefinedDeep } from '../utils/firestoreData';
import { toDateKey } from '../utils/format';

/**
 * The real, opt-in leaderboard. One doc per opted-in user at leaderboardEntries/{uid}, written
 * by that user's own signed-in client (see useLeaderboardSync) and read publicly by everyone
 * (see subscribeLeaderboard). Nobody appears here until they turn on "Show me on the public
 * leaderboard" in Settings — see SettingsPage.tsx's Leaderboard section — and only their
 * broker-synced trades (sourceId starting with "snaptrade:") ever count; manual entries can't
 * qualify, the same rule the mock version documented before this became real.
 *
 * Trust model: like every other self-reported number in this app (a manually entered trade, a
 * coach share, a share card), this is computed and written by the user's own client rather than
 * a server job — consistent with how coachShares already works (see services/coachShare.ts and
 * the matching firestore.rules block), not a new weaker link. Firestore rules only let a user
 * write their own doc, and only broker-synced trades are counted, which closes the easy cheat
 * (typing in a fake trade). Someone editing their own trade docs directly via devtools could
 * still inflate their number — the same trust boundary manual trades already have everywhere
 * else in the app today. A fully tamper-proof version would re-derive numbers from the SnapTrade
 * API server-side on a schedule instead of trusting Firestore trade docs; that's a bigger,
 * separate lift, documented as a known follow-up rather than pretended away.
 */

export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'allTime';
export type LeaderboardCategory = 'profit' | 'consistency' | 'risk';

export interface LeaderboardPeriodStats {
  netPnl: number;
  winRate: number;
  avgRR: number;
  tradeCount: number;
}

export interface LeaderboardEntry {
  uid: string;
  /** Absent on anonymous entries — the document is world-readable, so the real name is simply
   *  never written rather than written and hidden by the UI. */
  username?: string;
  isAnonymous: boolean;
  /** Deterministic "Trader #1234"-style label derived from uid — stable across reloads/writes,
   *  used in place of `username` whenever isAnonymous is true. */
  anonLabel: string;
  updatedAt: string;
  stats: Record<LeaderboardPeriod, LeaderboardPeriodStats>;
}

const EMPTY_PERIOD_STATS: LeaderboardPeriodStats = { netPnl: 0, winRate: 0, avgRR: 0, tradeCount: 0 };
const PERIODS: LeaderboardPeriod[] = ['day', 'week', 'month', 'allTime'];

/** Trade count a period needs before it's eligible for the rate-based categories (consistency,
 *  risk) — a single lucky trade shouldn't be able to claim #1 win rate. Profit has no minimum:
 *  net P&L is meaningful even from one trade. */
export const MIN_TRADES_FOR_RATE_CATEGORIES = 20;

const METRIC_FIELD: Record<LeaderboardCategory, keyof LeaderboardPeriodStats> = {
  profit: 'netPnl',
  consistency: 'winRate',
  risk: 'avgRR',
};

// Firestore has no server-side way to also filter out low-trade-count rows for the rate
// categories without a composite index per period/category pair, so this fetches a generous
// pool ordered by the metric and filters + trims to DISPLAY_LIMIT client-side instead — zero
// manual Firestore index setup required, at the cost of only ever surfacing the top FETCH_LIMIT
// entries by raw metric value. Fine at this app's scale; revisit if the leaderboard gets big.
const FETCH_LIMIT = 100;
const DISPLAY_LIMIT = 25;

function leaderboardDoc(uid: string) {
  return doc(getFirebaseDb(), 'leaderboardEntries', uid);
}

/** Deterministic "Trader #1234"-style label from a uid, so an anonymous row reads the same
 *  across reloads and repeat writes instead of re-rolling a random name every sync. */
export function anonLabelForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return `Trader #${1000 + (hash % 9000)}`;
}

function periodStartKey(period: LeaderboardPeriod, today: Date): string | null {
  if (period === 'allTime') return null;
  if (period === 'day') return toDateKey(today);
  if (period === 'week') {
    // Sunday-start week, matching the calendar grid used everywhere else in the app
    // (CalendarView.tsx renders SUN..SAT).
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    return toDateKey(start);
  }
  return toDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
}

function tradesInPeriod(trades: Trade[], period: LeaderboardPeriod, today: Date): Trade[] {
  const start = periodStartKey(period, today);
  if (!start) return trades;
  const todayKey = toDateKey(today);
  return trades.filter((t) => t.date >= start && t.date <= todayKey);
}

/** Computes day/week/month/all-time stats from only the broker-synced trades in `allTrades`. */
export function computeLeaderboardStats(
  allTrades: Trade[],
  today: Date = new Date(),
): Record<LeaderboardPeriod, LeaderboardPeriodStats> {
  const synced = allTrades.filter((t) => Boolean(t.sourceId?.startsWith('snaptrade:')));
  const out = {} as Record<LeaderboardPeriod, LeaderboardPeriodStats>;

  for (const period of PERIODS) {
    const periodTrades = tradesInPeriod(synced, period, today);
    if (periodTrades.length === 0) {
      out[period] = { ...EMPTY_PERIOD_STATS };
      continue;
    }
    const stats = computeStats(periodTrades);
    out[period] = {
      netPnl: Math.round(stats.netPnl * 100) / 100,
      winRate: Math.round(stats.winRate * 10) / 10,
      avgRR: Math.round(stats.avgRR * 100) / 100,
      tradeCount: stats.totalTrades,
    };
  }

  return out;
}

/** Creates or overwrites the caller's own leaderboard entry. Call only when the user is opted
 *  in — see useLeaderboardSync, which also handles removing it the moment they opt out. */
export async function upsertLeaderboardEntry(
  uid: string,
  username: string,
  isAnonymous: boolean,
  trades: Trade[],
): Promise<void> {
  /*
   * An anonymous entry must not carry the real username.
   *
   * The setting says "hide my username, use a random display name instead", and the leaderboard UI
   * honoured that — but the username was written to the document anyway, and
   * leaderboardEntries is world-readable by design so the board can be queried. Anyone could read
   * the real name straight out of Firestore. The checkbox hid it from the page, not from people.
   *
   * Omitted rather than blanked so the field is genuinely absent from the stored document.
   */
  const entry: LeaderboardEntry = {
    uid,
    ...(isAnonymous ? {} : { username }),
    isAnonymous,
    anonLabel: anonLabelForUid(uid),
    updatedAt: new Date().toISOString(),
    stats: computeLeaderboardStats(trades),
  };
  await setDoc(leaderboardDoc(uid), stripUndefinedDeep(entry));
}

export async function removeLeaderboardEntry(uid: string): Promise<void> {
  try {
    await deleteDoc(leaderboardDoc(uid));
  } catch {
    /* nothing to remove, or offline — next opt-in-state change will retry */
  }
}

/** Live-subscribes to the top entries for one period + category. Nobody appears here until
 *  they've opted in in Settings, so an empty result is the normal, expected state, not an
 *  error — LeaderboardContent.tsx renders a "nobody yet, be the first" empty state for it. */
export function subscribeLeaderboard(
  period: LeaderboardPeriod,
  category: LeaderboardCategory,
  onChange: (entries: LeaderboardEntry[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const metric = METRIC_FIELD[category];
  const q = query(
    collection(getFirebaseDb(), 'leaderboardEntries'),
    orderBy(`stats.${period}.${metric}`, 'desc'),
    fbLimit(FETCH_LIMIT),
  );

  return onSnapshot(
    q,
    (snap) => {
      const eligible = snap.docs
        .map((d) => d.data() as LeaderboardEntry)
        .filter((e) => {
          const s = e.stats?.[period];
          if (!s || s.tradeCount <= 0) return false;
          if (category !== 'profit' && s.tradeCount < MIN_TRADES_FOR_RATE_CATEGORIES) return false;
          return true;
        });
      onChange(eligible.slice(0, DISPLAY_LIMIT));
    },
    onError,
  );
}
