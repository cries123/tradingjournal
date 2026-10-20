import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import type { CompactBars, PathItem } from '../utils/tradePathBars';

/** One answer from /api/trade-paths: the bars, or null when that day was never opened in replay. */
export interface PathAnswer {
  index: number;
  osi: string | null;
  bars: CompactBars | null;
  stored: boolean;
}

/** The request's ceiling, mirrored from server/tradePaths.ts. */
export const PATH_ITEMS_PER_REQUEST = 150;

export async function fetchTradePaths(items: PathItem[]): Promise<PathAnswer[]> {
  if (!isFirebaseConfigured()) throw new Error('Sign in to measure trades.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to measure trades.');
  const res = await fetch('/api/trade-paths', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const data = (await res.json().catch(() => ({}))) as { items?: PathAnswer[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not read the stored market data.');
  return data.items ?? [];
}
