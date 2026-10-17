/**
 * The figures the landing page's proof strip is allowed to publish.
 *
 * Counted, not claimed: every number comes from a Firestore count aggregation over the real
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
 * Costs: a count aggregation is billed as one read per thousand index entries, and the response is
 * cached at the CDN for an hour, so even a six-figure trade count is a few hundred reads an hour at
 * most — against a site that has run out of its daily read quota before.
 */

export const TRADES_FLOOR = 1_000;
export const TRADERS_FLOOR = 100;

export interface PublicCounts {
  /** Every journal entry, across every user — the `trades` subcollection under users/{uid}. */
  trades: number | null;
  /** Every account with a users/{uid} profile, i.e. everyone who has signed in. */
  traders: number | null;
}

export interface PublicStats {
  trades: number | null;
  traders: number | null;
  updatedAt: string;
}

/** 12,437 → 12,000; 1,874 → 1,800; 437 → 430. Never rounds up, so the "+" is always true. */
export function roundDownForDisplay(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const digits = Math.floor(Math.log10(n)) + 1;
  const unit = 10 ** Math.max(0, digits - 2);
  return Math.floor(n / unit) * unit;
}

/** Applies the floors and the rounding. A figure that could not be counted stays null. */
export function publicFigures(counts: PublicCounts, now: Date): PublicStats {
  const shown = (n: number | null, floor: number) =>
    n === null || n < floor ? null : roundDownForDisplay(n);
  return {
    trades: shown(counts.trades, TRADES_FLOOR),
    traders: shown(counts.traders, TRADERS_FLOOR),
    updatedAt: now.toISOString(),
  };
}

/** The slice of the Admin SDK this needs, so it can be tested without one. */
export interface CountingDb {
  collection(path: string): { count(): { get(): Promise<{ data(): { count: number } }> } };
  collectionGroup(id: string): { count(): { get(): Promise<{ data(): { count: number } }> } };
}

/**
 * Both counts, each allowed to fail on its own.
 *
 * A collection-group count that Firestore refuses (an index it wants, a quota) must not take the
 * traders figure down with it, and neither may surface as an error on the landing page — a strip
 * with one fewer figure is a fine outcome; a 500 is not.
 */
export async function readPublicCounts(db: CountingDb): Promise<PublicCounts> {
  const [trades, traders] = await Promise.allSettled([
    db.collectionGroup('trades').count().get(),
    db.collection('users').count().get(),
  ]);
  if (trades.status === 'rejected') console.warn('[public-stats] trades count failed:', trades.reason);
  if (traders.status === 'rejected') console.warn('[public-stats] users count failed:', traders.reason);
  return {
    trades: trades.status === 'fulfilled' ? trades.value.data().count : null,
    traders: traders.status === 'fulfilled' ? traders.value.data().count : null,
  };
}
