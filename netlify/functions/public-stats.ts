import type { Handler } from '@netlify/functions';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import { publicFigures, readPublicCounts, type CountingDb, type PublicStats } from '../../server/publicStats';

/**
 * Public, unauthenticated: the landing page's live figures. See server/publicStats.ts for what is
 * published and why.
 *
 * Cached twice. At the CDN for an hour (s-maxage), so every visitor in that hour is served one
 * stored answer and Firestore is asked about once an hour per edge; and in this function instance
 * for the same hour, for the requests that miss the CDN. A figure that is an hour old is still
 * true — it was rounded down when it was published.
 */
const CACHE_MS = 60 * 60 * 1000;
let cached: { at: number; value: PublicStats } | null = null;

export const handler: Handler = async () => {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    try {
      const counts = await readPublicCounts(getAdminFirestore() as unknown as CountingDb);
      cached = { at: now, value: publicFigures(counts, new Date(now)) };
    } catch (err) {
      // No Admin SDK credentials, most likely. The page shows its fixed facts instead.
      console.warn('[public-stats] unavailable:', err);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        body: JSON.stringify({ trades: null, traders: null, pnl: null, updatedAt: new Date(now).toISOString() }),
      };
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
    body: JSON.stringify(cached.value),
  };
};
