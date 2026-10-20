import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import type { Bar } from '../utils/marketReplay';
import type { ReplayContractRequest } from '../utils/replayTrades';

export interface ReplayData {
  date: string;
  sessionStart: number;
  sessionEnd: number;
  underlying: { symbol: string; proxyFor: string | null; bars: Bar[] } | null;
  contracts: { index: number; osi: string | null; bars: Bar[] }[];
}

export class ReplayError extends Error {
  readonly status: number;
  readonly availableAt: string | null;

  constructor(message: string, status: number, availableAt: string | null = null) {
    super(message);
    this.name = 'ReplayError';
    this.status = status;
    this.availableAt = availableAt;
  }
}

/**
 * One past session's bars from /api/market-replay. The server buys each symbol-day once and keeps
 * it, so asking again for a day already seen costs nothing.
 */
export async function fetchReplay(date: string, underlying: string | null, contracts: ReplayContractRequest[]): Promise<ReplayData> {
  if (!isFirebaseConfigured()) throw new ReplayError('Sign in to use market replay.', 401);
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new ReplayError('Sign in to use market replay.', 401);
  const token = await user.getIdToken();

  const res = await fetch('/api/market-replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ date, underlying, contracts }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<ReplayData> & { error?: string; availableAt?: string };
  if (!res.ok) throw new ReplayError(data.error ?? 'Market data is unavailable right now.', res.status, data.availableAt ?? null);
  return data as ReplayData;
}
