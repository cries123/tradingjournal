import type { FeedDirection } from '../src/utils/syncPlan';
import {
  mapSnapTradeActivities,
  readFeedDirection,
  type MappedSync,
  type SnapTradeActivityLike,
} from './mapSnapTradeActivities';

/**
 * One activity pull, with a clock on it.
 *
 * The manual sync paged SnapTrade's feed serially, up to 25 pages of 1,000, with nothing watching
 * the time. A first Robinhood sync of 11,491 activities built 8,790 trades on the server, wrote
 * "8,790 trades out" into the trader's history, and then died at Netlify's synchronous limit — the
 * browser got Netlify's 504 page, 265 bytes of HTML, and saved nothing. The sync had been charged
 * before the pull and the refund never ran because the function was killed. Two earlier attempts
 * on the same account had returned an empty feed.
 *
 * So the pull now stops starting pages when the next one is not expected back in time, matches
 * what it has, and hands the rest to the next sync with a date to continue from. The rules that
 * make a cut-short pull SAFE to match are the whole of this file:
 *
 *  1. Only the OLDEST end of the window is ever matched. FIFO pairing processes fills in date
 *     order, so the trades from the first N days of a window are exactly the first trades a full
 *     pull would produce, and the lots left open after them are exactly the lots open on day N.
 *     The newest slice of a window is worthless on its own: every close in it whose open is older
 *     would pair with the wrong lot, or be reported as a short the trader never placed.
 *
 *  2. Which end of the feed is the oldest depends on SnapTrade, and has never been observed on a
 *     real account. The direction is read off the first page's dates (or remembered from an earlier
 *     pull); a newest-first feed is paged from its last offset backwards, using the pagination
 *     total, so that what is in hand when the clock runs out is still the oldest history.
 *
 *  3. The newest day in hand is held back, because its remaining fills may be on a page that was
 *     never fetched, and the matcher sorts opens before closes WITHIN a day — a close fetched today
 *     could pair with an open that arrives tomorrow. Whole days only, cut on the UTC calendar day of
 *     `trade_date`, which is the day SnapTrade's inclusive `startDate` filters on: resuming from the
 *     held-back day re-reads nothing that was matched and skips nothing that was not.
 *
 * Pure apart from the page fetcher it is handed, so every rule above is tested with a fake feed.
 */

export const PAGE_SIZE = 1000;

/**
 * The most trade JSON one answer may carry.
 *
 * Netlify caps a synchronous function's response at 6 MB. 8,790 Robinhood trades serialise to
 * about 4 MB, so an account twice that size would survive the clock and be cut off at the response
 * instead. 4.5 MB leaves the rest of the body, and the runtime's own framing, inside the cap. The
 * cut is by whole days, like the clock's, so the next sync continues from a date.
 */
export const MAX_TRADE_BYTES = 4_500_000;

export interface FeedPage {
  batch: SnapTradeActivityLike[];
  /** SnapTrade's count of rows in the whole window, from the pagination metadata, when it sent one. */
  total: number | undefined;
}

export type FetchPage = (offset: number) => Promise<FeedPage>;

export type PullStop =
  /** The next page was not expected back before the deadline. */
  | 'budget'
  /** The runaway backstop. */
  | 'page-cap'
  /** A newest-first feed with no pagination total: its oldest end cannot be found, so nothing is safe to match. */
  | 'unknown-total'
  /** Everything was read; the answer would have been too large to send, so the newest days wait. */
  | 'response-size';

export interface PullOptions {
  /** Epoch ms. No page is started that is not expected to be back by then. */
  deadline: number;
  /** Runaway backstop, in pages, for pagination metadata that never ends. */
  maxPages: number;
  /** The direction an earlier pull observed, for a first page that holds a single day. */
  hint?: FeedDirection;
  /** The inventory at the start of the window: the lots a cut-short pull carried to this one. */
  openLots?: SnapTradeActivityLike[];
  /**
   * How many rows the window is expected to hold, from the previous pull's count less what it
   * matched. With a newest-first hint this lets the pull start at the far end instead of spending
   * its first page on a front it cannot use; the true total on that page's response corrects it.
   */
  expectedTotal?: number;
  maxTradeBytes?: number;
  now?: () => number;
}

export interface PullResult {
  mapped: MappedSync;
  /** Rows the broker returned, including any held back for the next sync. */
  activityCount: number;
  /** Of those, the rows this pull matched. Zero with `partial` means no progress was possible. */
  matchedCount: number;
  totalActivityCount: number | undefined;
  pages: number;
  /** The window was not finished; `resumeFrom` is the first day left for the next pull. */
  partial: boolean;
  resumeFrom: string | undefined;
  stoppedBy: PullStop | null;
  /** The direction the feed was read to run, or null when no page spanned two days and it was assumed. */
  direction: FeedDirection | null;
}

interface PagedFeed {
  /** Each page by its offset, in the order the feed gave it. */
  pages: Map<number, SnapTradeActivityLike[]>;
  complete: boolean;
  direction: FeedDirection | null;
  total: number | undefined;
  stoppedBy: Exclude<PullStop, 'response-size'> | null;
}

/** The offset of the last page, for a feed that says how many rows it holds. */
function lastOffsetOf(total: number): number {
  return Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE;
}

async function pageFeed(
  fetchPage: FetchPage,
  o: { deadline: number; maxPages: number; hint?: FeedDirection; expectedTotal?: number; now: () => number },
): Promise<PagedFeed> {
  const pages = new Map<number, SnapTradeActivityLike[]>();
  let total: number | undefined;
  /** The longest a page has taken this pull: the honest estimate for the next one. */
  let slowest = 0;
  let stoppedBy: PagedFeed['stoppedBy'] = null;

  const fetchAt = async (offset: number): Promise<SnapTradeActivityLike[]> => {
    const started = o.now();
    const page = await fetchPage(offset);
    slowest = Math.max(slowest, o.now() - started);
    total = page.total ?? total;
    pages.set(offset, page.batch);
    return page.batch;
  };

  /**
   * Whether another page may be started. The first always is; after that the clock decides.
   *
   * This is the line the October timeout turned on. A page is expected to take as long as the
   * slowest one so far — the first includes the connection setup, so later ones usually come in
   * under it — and a page that would land after the deadline is not started at all. Stopping at
   * the deadline instead would mean returning with nothing, which is the failure being fixed.
   */
  const canStart = (): boolean => {
    if (pages.size >= o.maxPages) {
      stoppedBy = 'page-cap';
      return false;
    }
    if (o.now() + slowest > o.deadline) {
      stoppedBy = 'budget';
      return false;
    }
    return true;
  };

  const done = (direction: FeedDirection | null): PagedFeed => ({ pages, complete: true, direction, total, stoppedBy: null });
  const cut = (direction: FeedDirection | null): PagedFeed => ({ pages, complete: false, direction, total, stoppedBy });

  /**
   * Newest first, from the far end towards the front.
   *
   * The oldest history is at the END, so that is where the pages come from, walking back towards
   * whatever is already in hand. A page that comes back empty (the total overstated) is kept as an
   * empty page, so the run stays contiguous. The offsets can shift if the broker's cache refreshes
   * mid-pull; that refresh happens once a day, the pull takes seconds, and the execution
   * fingerprint in dedupe absorbs a row repeated across a boundary.
   */
  const pageFromTheEnd = async (knownTotal: number): Promise<PagedFeed> => {
    for (let offset = lastOffsetOf(knownTotal); offset >= 0; offset -= PAGE_SIZE) {
      if (pages.has(offset)) continue;
      if (!canStart()) return cut('newest-first');
      await fetchAt(offset);
    }
    return done('newest-first');
  };

  /*
   * A pull continuing a feed already known to run newest first does not read the front at all.
   *
   * The front page is the newest history, which such a pull can never use; reading it only to
   * learn the total cost a whole page of a budget that may hold two, and when the far end's page
   * was short — a few rows of one day — the pull made no progress and the next one did the same.
   * The previous pull knew how many rows it left, so the far end is estimated from that and the
   * truth read off the first response; if more rows have arrived since, the loop below reaches the
   * real end and walks back to meet the page already in hand.
   */
  if (o.hint === 'newest-first' && o.expectedTotal !== undefined && o.expectedTotal > PAGE_SIZE) {
    await fetchAt(lastOffsetOf(o.expectedTotal));
    return pageFromTheEnd(total ?? o.expectedTotal);
  }

  const first = await fetchAt(0);
  if (first.length < PAGE_SIZE) return done(readFeedDirection(first) ?? o.hint ?? null);

  let direction = readFeedDirection(first) ?? o.hint ?? null;
  if (direction === null) {
    /*
     * A full page on a single day says nothing about which way the feed runs, and the direction
     * decides which end to page from. The second page almost always settles it; 2,000 fills on one
     * UTC day with no earlier pull to remember the direction is the one case it does not, and then
     * the feed is read forward on the assumption it is oldest-first — the matcher reports the
     * assumption (orientationAssumed) and the screen says so.
     */
    if (!canStart()) return cut(null);
    const second = await fetchAt(PAGE_SIZE);
    direction = readFeedDirection([...first, ...second]) ?? o.hint ?? null;
    if (second.length < PAGE_SIZE) return done(direction);
  }

  if (direction !== 'newest-first') {
    // Oldest first, or assumed so: the oldest history is the front of the feed, so keep reading forward.
    for (let offset = pages.size * PAGE_SIZE; canStart(); offset += PAGE_SIZE) {
      if ((await fetchAt(offset)).length < PAGE_SIZE) return done(direction);
    }
    return cut(direction);
  }

  if (total === undefined) {
    // No way to find the far end. Read forward and hope the whole window fits; if it does not,
    // nothing in hand is the oldest history, and the caller is told why no progress was possible.
    for (let offset = pages.size * PAGE_SIZE; canStart(); offset += PAGE_SIZE) {
      if ((await fetchAt(offset)).length < PAGE_SIZE) return done(direction);
    }
    stoppedBy = 'unknown-total';
    return cut(direction);
  }

  return pageFromTheEnd(total);
}

/**
 * The rows that are known to be the oldest of the window, contiguous, in the feed's own order.
 *
 * Everything, once the window is complete. Otherwise the pages that run unbroken from the oldest
 * end: from offset 0 upward for an oldest-first feed, from the last offset downward for a
 * newest-first one — where the first page, the newest, only joins once every page between has
 * been fetched.
 */
function oldestRun(feed: PagedFeed): SnapTradeActivityLike[] {
  const offsets = [...feed.pages.keys()].sort((a, b) => a - b);
  if (feed.complete) return offsets.flatMap((offset) => feed.pages.get(offset) ?? []);

  if (feed.direction === 'newest-first') {
    if (feed.total === undefined) return [];
    const run: number[] = [];
    for (let offset = lastOffsetOf(feed.total); offset >= 0 && feed.pages.has(offset); offset -= PAGE_SIZE) {
      run.unshift(offset);
    }
    return run.flatMap((offset) => feed.pages.get(offset) ?? []);
  }

  const run: SnapTradeActivityLike[] = [];
  for (let offset = 0; feed.pages.has(offset); offset += PAGE_SIZE) run.push(...(feed.pages.get(offset) ?? []));
  return run;
}

/** The UTC calendar day of a fill — the day SnapTrade's start date filters on. */
export function activityDay(a: SnapTradeActivityLike): string {
  return (a.trade_date ?? '').slice(0, 10);
}

/**
 * What a cut-short run may be matched: everything before its newest day.
 *
 * The newest day is held back whole, because the fills of that day may continue on a page that
 * was never fetched and the matcher pairs within a day by sorting opens first — a close in hand
 * could be waiting for an open on the next page. The held-back day is where the next pull starts.
 *
 * A run that is a single day holds nothing back and makes no progress; the resume point is still
 * that day, and the caller says so rather than guessing at the day's pairing.
 */
export function cutUnfinishedDay(
  run: SnapTradeActivityLike[],
  complete: boolean,
): { activities: SnapTradeActivityLike[]; resumeFrom: string | undefined } {
  if (complete) return { activities: run, resumeFrom: undefined };
  let newest = '';
  for (const a of run) {
    const day = activityDay(a);
    if (day > newest) newest = day;
  }
  if (newest === '') return { activities: [], resumeFrom: undefined };
  return { activities: run.filter((a) => activityDay(a) < newest), resumeFrom: newest };
}

/**
 * Holds back the newest days until the trades fit in one answer.
 *
 * The trades are sorted by journal day, so the day of the first trade past the budget is the cut.
 * That is an Eastern day and the activities are cut on their UTC day, which is never earlier, so
 * what is matched after the cut is a subset of the trades that fit — and the matcher is run again
 * over exactly those fills, so the open lots it reports are the lots open at the cut, not at the
 * end. Bounded: the estimate from bytes-per-trade is usually right the first time.
 */
function fitTrades(
  activities: SnapTradeActivityLike[],
  resumeFrom: string | undefined,
  map: (rows: SnapTradeActivityLike[]) => MappedSync,
  maxBytes: number,
): { mapped: MappedSync; activities: SnapTradeActivityLike[]; resumeFrom: string | undefined; cut: boolean } {
  let current = activities;
  let resume = resumeFrom;
  let cut = false;
  let mapped = map(current);

  for (let attempt = 0; attempt < 4; attempt++) {
    const bytes = JSON.stringify(mapped.trades).length;
    if (bytes <= maxBytes) break;

    const keep = Math.floor(mapped.trades.length * (maxBytes / bytes) * 0.9);
    const day = mapped.trades[Math.max(0, Math.min(keep, mapped.trades.length - 1))].date;
    // A single day's trades alone exceed the cap: there is no earlier day to cut at. Sent as is.
    if (keep < 1 || mapped.trades[0].date >= day) break;

    current = current.filter((a) => activityDay(a) < day);
    resume = day;
    cut = true;
    mapped = map(current);
  }

  return { mapped, activities: current, resumeFrom: resume, cut };
}

export async function pullWindow(fetchPage: FetchPage, options: PullOptions): Promise<PullResult> {
  const now = options.now ?? Date.now;
  const feed = await pageFeed(fetchPage, {
    deadline: options.deadline,
    maxPages: options.maxPages,
    hint: options.hint,
    expectedTotal: options.expectedTotal,
    now,
  });

  const activityCount = [...feed.pages.values()].reduce((n, batch) => n + batch.length, 0);
  const chunk = cutUnfinishedDay(oldestRun(feed), feed.complete);

  // The matcher is told the direction when a page spanned two days and read it, so a chunk that
  // happens to hold one day is oriented the same way the pages were. The carried lots go in on
  // every mapping, including the re-mappings of a size cut: they are the state at the window start.
  const map = (rows: SnapTradeActivityLike[]) =>
    mapSnapTradeActivities(rows, {
      feedDirection: options.hint ?? feed.direction ?? undefined,
      openLots: options.openLots,
    });
  const fit = fitTrades(chunk.activities, chunk.resumeFrom, map, options.maxTradeBytes ?? MAX_TRADE_BYTES);

  const partial = !feed.complete || fit.cut;
  return {
    mapped: fit.mapped,
    activityCount,
    matchedCount: fit.activities.length,
    totalActivityCount: feed.total,
    pages: feed.pages.size,
    partial,
    resumeFrom: partial ? fit.resumeFrom : undefined,
    stoppedBy: fit.cut ? 'response-size' : feed.stoppedBy,
    direction: feed.direction,
  };
}
