import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import type { Trade } from '../types';
import type { TradingStats } from '../utils/stats';
import { stripUndefinedDeep } from '../utils/firestoreData';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

/** A trade as it goes out over a share link — everything a viewer would want to review a trade
 *  (prices, times, contract, fees, notes, grade, etc.), minus account-identifying and internal
 *  fields. Structurally still a Trade, so the same TradeDetails component that renders a trade
 *  in the app can render one here too — nothing needs a second, drifted rendering path. */
export type SharedTrade = Omit<
  Trade,
  'accountId' | 'accountType' | 'sourceId' | 'imageUrls' | 'chartUrl' | 'strategyId' | 'savedAt'
>;

export interface CoachShareSnapshot {
  ownerUid: string;
  ownerUsername: string;
  enabled: boolean;
  updatedAt: string;
  /** Inclusive date range (YYYY-MM-DD) this share covers. */
  rangeStart: string;
  rangeEnd: string;
  stats: Pick<TradingStats, 'netPnl' | 'winRate' | 'totalTrades' | 'profitFactor' | 'avgProfitPerTrade'>;
  trades: SharedTrade[];
  /** True when the source range had more trades than MAX_SHARED_TRADES and the list below was
   *  capped to the most recent ones. */
  truncated: boolean;
}

/** Firestore documents cap out at 1MiB; a few hundred trades of structured detail stays well
 *  under that with plenty of headroom, so this is a generous safety cap, not a normal ceiling. */
const MAX_SHARED_TRADES = 500;

function shareToken(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function sanitizeTrade(t: Trade): SharedTrade {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop these keys
  const { accountId, accountType, sourceId, imageUrls, chartUrl, strategyId, savedAt, ...rest } = t;
  return rest;
}

/** Creates or updates the caller's trade-history share link for a chosen date range. Reuses the
 *  existing token when one is passed so "Update link" refreshes content at the same URL instead
 *  of invalidating links already sent out. */
export async function createTradeHistoryShare(
  uid: string,
  username: string,
  existingToken: string | undefined,
  tradesInRange: Trade[],
  stats: TradingStats,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ token: string; truncated: boolean }> {
  if (!isFirebaseConfigured()) throw new Error('Sign in required to share your trade history');

  const nextToken = existingToken || shareToken();
  const sorted = [...tradesInRange].sort((a, b) => b.date.localeCompare(a.date));
  const truncated = sorted.length > MAX_SHARED_TRADES;
  const limited = sorted.slice(0, MAX_SHARED_TRADES);

  const snapshot: CoachShareSnapshot = {
    ownerUid: uid,
    ownerUsername: username,
    enabled: true,
    updatedAt: new Date().toISOString(),
    rangeStart,
    rangeEnd,
    stats: {
      netPnl: stats.netPnl,
      winRate: stats.winRate,
      totalTrades: stats.totalTrades,
      profitFactor: stats.profitFactor,
      avgProfitPerTrade: stats.avgProfitPerTrade,
    },
    trades: limited.map(sanitizeTrade),
    truncated,
  };

  await setDoc(doc(getFirebaseDb(), 'coachShares', nextToken), stripUndefinedDeep(snapshot));
  return { token: nextToken, truncated };
}

export async function disableCoachShare(token: string): Promise<void> {
  if (!isFirebaseConfigured() || !token) return;
  await deleteDoc(doc(getFirebaseDb(), 'coachShares', token));
}

export async function fetchCoachShare(token: string): Promise<CoachShareSnapshot | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(doc(getFirebaseDb(), 'coachShares', token));
  if (!snap.exists()) return null;
  return snap.data() as CoachShareSnapshot;
}

export function coachShareUrl(token: string): string {
  const base =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://trendchasers.net';
  return `${base}/coach/${token}`;
}
