/**
 * The figures the landing page's proof strip is allowed to publish.
 *
 * Counted, not claimed: every number comes from a Firestore aggregation over the real
 * collections, so the strip can never say something the database does not. Two rules decide what
 * reaches the page:
 *
 * - **A floor.** A proof strip reading "41 traders" is an argument against signing up. Below the
 *   floor a figure is withheld (null) and the strip shows a fixed fact in its place, rather than
 *   advertising how small the product still is. The floors are the smallest numbers that read as
 *   social proof rather than as a waitlist.
 * - **Rounded down to two significant figures, with a "+".** 12,437 is published as 12,000+: true
 *   for the whole hour the response is cached while trades keep arriving, and it does not imply a
 *   precision a cached count cannot keep.
 *
 * Costs: an aggregation is billed as one read per thousand index entries, and the response is
 * cached at the CDN for an hour, so even a six-figure trade count is a few hundred reads an hour at
 * most — against a site that has run out of its daily read quota before.
 */

import { AggregateField } from 'firebase-admin/firestore';
import {
  PNL_FLOOR,
  publishedFigure,
  roundDownForDisplay,
  TRADERS_FLOOR,
  TRADES_FLOOR,
} from '../src/utils/publicFigures';

// The rules live in src/utils/publicFigures.ts so the admin tile can say how close a figure is to
// showing; re-exported here for the callers and tests that read them from the server side.
export { PNL_FLOOR, roundDownForDisplay, TRADERS_FLOOR, TRADES_FLOOR };

export interface PublicCounts {
  /** Every journal entry, across every user — the `trades` subcollection under users/{uid}. */
  trades: number | null;
  /** Every account with a users/{uid} profile, i.e. everyone who has signed in. */
  traders: number | null;
  /** The sum of `pnl` over those same entries, in dollars. Negative when the users lose overall. */
  pnl: number | null;
}

export interface PublicStats {
  trades: number | null;
  traders: number | null;
  pnl: number | null;
  updatedAt: string;
}

/** Applies the floors and the rounding. A figure that could not be counted stays null. */
export function publicFigures(counts: PublicCounts, now: Date): PublicStats {
  return {
    trades: publishedFigure(counts.trades, TRADES_FLOOR),
    traders: publishedFigure(counts.traders, TRADERS_FLOOR),
    pnl: publishedFigure(counts.pnl, PNL_FLOOR),
    updatedAt: now.toISOString(),
  };
}

interface Counting {
  count(): { get(): Promise<{ data(): { count: number } }> };
}

/** The slice of the Admin SDK this needs, so it can be tested without one. */
export interface CountingDb {
  collection(path: string): Counting;
  collectionGroup(id: string): Counting & {
    aggregate(spec: Record<string, unknown>): { get(): Promise<{ data(): Record<string, unknown> }> };
  };
}

/** The aggregation the P&L figure runs — shared with the admin handler so both read the same sum. */
export const PNL_AGGREGATE = { pnl: AggregateField.sum('pnl') };

/**
 * All three figures, each allowed to fail on its own.
 *
 * A collection-group aggregation that Firestore refuses (an index it wants, a quota) must not take
 * the other figures down with it, and neither may surface as an error on the landing page — a
 * strip with one fewer figure is a fine outcome; a 500 is not. The P&L sum is the likeliest to be
 * refused: it reads `pnl` across every user's subcollection, which needs that field indexed at
 * collection-group scope, and the warning carries Firestore's link to create it.
 */
export async function readPublicCounts(db: CountingDb): Promise<PublicCounts> {
  const [trades, traders, pnl] = await Promise.allSettled([
    db.collectionGroup('trades').count().get(),
    db.collection('users').count().get(),
    db.collectionGroup('trades').aggregate(PNL_AGGREGATE).get(),
  ]);
  if (trades.status === 'rejected') console.warn('[public-stats] trades count failed:', trades.reason);
  if (traders.status === 'rejected') console.warn('[public-stats] users count failed:', traders.reason);
  if (pnl.status === 'rejected') console.warn('[public-stats] pnl sum failed:', pnl.reason);
  const sum = pnl.status === 'fulfilled' ? pnl.value.data().pnl : null;
  return {
    trades: trades.status === 'fulfilled' ? trades.value.data().count : null,
    traders: traders.status === 'fulfilled' ? traders.value.data().count : null,
    pnl: typeof sum === 'number' && Number.isFinite(sum) ? sum : null,
  };
}
