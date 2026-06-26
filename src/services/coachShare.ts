import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import type { Trade } from '../types';
import type { TradingStats } from '../utils/stats';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface CoachShareSnapshot {
  ownerUid: string;
  ownerUsername: string;
  enabled: boolean;
  updatedAt: string;
  monthLabel: string;
  stats: Pick<
    TradingStats,
    'netPnl' | 'winRate' | 'totalTrades' | 'profitFactor' | 'avgProfitPerTrade'
  >;
  recentTrades: Array<{
    date: string;
    symbol: string;
    pnl: number;
    setup?: string;
    side?: string;
    grade?: string;
  }>;
}

function shareToken(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export async function enableCoachShare(
  uid: string,
  username: string,
  token: string | undefined,
  trades: Trade[],
  stats: TradingStats,
  year: number,
  month: number,
): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error('Sign in required for coach sharing');

  const nextToken = token || shareToken();
  const monthLabel = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

  const snapshot: CoachShareSnapshot = {
    ownerUid: uid,
    ownerUsername: username,
    enabled: true,
    updatedAt: new Date().toISOString(),
    monthLabel,
    stats: {
      netPnl: stats.netPnl,
      winRate: stats.winRate,
      totalTrades: stats.totalTrades,
      profitFactor: stats.profitFactor,
      avgProfitPerTrade: stats.avgProfitPerTrade,
    },
    recentTrades: [...trades]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)
      .map((t) => ({
        date: t.date,
        symbol: t.symbol,
        pnl: t.pnl,
        setup: t.setup,
        side: t.side,
        grade: t.grade,
      })),
  };

  await setDoc(doc(getFirebaseDb(), 'coachShares', nextToken), snapshot);
  return nextToken;
}

export async function disableCoachShare(token: string): Promise<void> {
  if (!isFirebaseConfigured() || !token) return;
  await deleteDoc(doc(getFirebaseDb(), 'coachShares', token));
}

export async function refreshCoachShare(
  token: string,
  trades: Trade[],
  stats: TradingStats,
  year: number,
  month: number,
  uid: string,
  username: string,
): Promise<void> {
  await enableCoachShare(uid, username, token, trades, stats, year, month);
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
