import { describe, expect, it } from 'vitest';
import {
  activityDay,
  cutUnfinishedDay,
  MAX_TRADE_BYTES,
  PAGE_SIZE,
  pullWindow,
  type FetchPage,
  type PullResult,
} from '../../server/activityPull';
import type { SnapTradeActivityLike } from '../../server/mapSnapTradeActivities';
import { nextSyncState, planSyncStart, type AccountSyncState, type FeedDirection } from '../utils/syncPlan';

/*
 * A pull with a clock on it.
 *
 * The first Robinhood sync of a large account pulled 11,491 activities over twelve serial pages and
 * was killed at Netlify's ten-second limit, after the server had already written "8,790 trades out"
 * into the trader's history. These drive the pull with a fake feed whose pages take a known time,
 * and pin the three rules that make a cut-short pull safe: only the oldest end is matched, the
 * newest day in hand is held back, and the next pull continues from that day — so that a history
 * read in pieces is the same history a single pull would have read.
 */

type Row = SnapTradeActivityLike & { id: string; trade_date: string };

const stock = (id: string, type: 'BUY' | 'SELL', units: number, price: number, at: string, symbol = 'SPY'): Row => ({
  id, type, units, price, fee: 1, trade_date: at, symbol: { symbol }, account: { id: 'acc-1' },
});

/** Weekdays from a Monday. */
function days(count: number, from = '2025-01-06'): string[] {
  const out: string[] = [];
  const at = new Date(`${from}T00:00:00Z`);
  while (out.length < count) {
    if (at.getUTCDay() !== 0 && at.getUTCDay() !== 6) out.push(at.toISOString().slice(0, 10));
    at.setUTCDate(at.getUTCDate() + 1);
  }
  return out;
}

/**
 * A scalper's history, oldest first: `perDay` round trips a day, each a buy and a sell with real
 * times, plus one swing position opened on the second day and closed on the second-to-last — the
 * lot that straddles every cut and has to pair across pulls.
 */
function scalpedHistory(dayCount: number, perDay: number): Row[] {
  const rows: Row[] = [];
  const session = days(dayCount);
  session.forEach((day, d) => {
    if (d === 1) rows.push(stock('swing-open', 'BUY', 5, 400, `${day}T14:31:00Z`, 'QQQ'));
    for (let i = 0; i < perDay; i++) {
      const minute = String(35 + (i % 20)).padStart(2, '0');
      const hour = String(14 + Math.floor(i / 20)).padStart(2, '0');
      rows.push(stock(`b-${day}-${i}`, 'BUY', 10, 500 + i, `${day}T${hour}:${minute}:00Z`));
      rows.push(stock(`s-${day}-${i}`, 'SELL', 10, 501 + i, `${day}T${hour}:${minute}:30Z`));
    }
    if (d === dayCount - 2) rows.push(stock('swing-close', 'SELL', 5, 420, `${day}T19:55:00Z`, 'QQQ'));
  });
  return rows;
}

interface FakeFeed {
  fetchPage: FetchPage;
  /** Every offset asked for, in order. */
  offsets: number[];
  clock: { t: number };
}

/**
 * SnapTrade, faked: pages of PAGE_SIZE over a feed in one direction, an inclusive startDate on the
 * UTC day like the real one, an optional pagination total, and a cost in milliseconds per page on
 * a clock the pull reads.
 */
function fakeFeed(
  history: Row[],
  o: { direction: FeedDirection; pageMs?: number; total?: boolean; startDate?: string },
): FakeFeed {
  const inWindow = o.startDate === undefined ? history : history.filter((r) => activityDay(r) >= o.startDate!);
  const feed = o.direction === 'newest-first' ? [...inWindow].reverse() : inWindow;
  const clock = { t: 0 };
  const offsets: number[] = [];
  return {
    clock,
    offsets,
    fetchPage: async (offset) => {
      offsets.push(offset);
      clock.t += o.pageMs ?? 0;
      return { batch: feed.slice(offset, offset + PAGE_SIZE), total: o.total === false ? undefined : feed.length };
    },
  };
}

const pullAll = (history: Row[], direction: FeedDirection) =>
  pullWindow(fakeFeed(history, { direction }).fetchPage, { deadline: Number.POSITIVE_INFINITY, maxPages: 100, now: () => 0 });

/** sourceId → P&L, the two facts dedupe and the journal care about. */
const byId = (r: PullResult) => new Map(r.mapped.trades.map((t) => [t.sourceId!, t.pnl]));

describe('a pull that fits', () => {
  it('reads the whole window and holds nothing back', async () => {
    const history = scalpedHistory(6, 300); // ~3,600 rows, four pages
    const feed = fakeFeed(history, { direction: 'oldest-first', pageMs: 100 });

    const r = await pullWindow(feed.fetchPage, { deadline: 10_000, maxPages: 25, now: () => feed.clock.t });

    expect(r.partial).toBe(false);
    expect(r.resumeFrom).toBeUndefined();
    expect(r.stoppedBy).toBeNull();
    expect(r.activityCount).toBe(history.length);
    expect(r.matchedCount).toBe(history.length);
    expect(r.mapped.trades).toHaveLength(6 * 300 + 1);
    expect(feed.offsets).toEqual([0, 1000, 2000, 3000]);
  });
});

describe('the budget', () => {
  const history = scalpedHistory(10, 250); // ~5,000 rows, six pages

  it('does not start a page that is not expected back by the deadline', async () => {
    // Each page takes a second. Two fit before 2.5s; a third would land at 3s.
    const feed = fakeFeed(history, { direction: 'oldest-first', pageMs: 1000 });

    const r = await pullWindow(feed.fetchPage, { deadline: 2500, maxPages: 25, now: () => feed.clock.t });

    expect(feed.offsets).toEqual([0, 1000]);
    expect(r.pages).toBe(2);
    expect(r.partial).toBe(true);
    expect(r.stoppedBy).toBe('budget');
    expect(feed.clock.t).toBeLessThanOrEqual(2500);
  });

  it('expects the next page to take as long as the slowest so far', async () => {
    // A slow first page (connection setup) and fast later ones: the estimate stays at the slow one.
    let calls = 0;
    const inner = fakeFeed(history, { direction: 'oldest-first' });
    const fetchPage: FetchPage = (offset) => {
      calls += 1;
      inner.clock.t += calls === 1 ? 1500 : 200;
      return inner.fetchPage(offset);
    };

    const r = await pullWindow(fetchPage, { deadline: 3500, maxPages: 25, now: () => inner.clock.t });

    // Pages land at 1500, 1700, 1900 and 2100; each next one is expected at +1500, and the fifth,
    // expected at 3600, is not started. Estimating from the fast pages would have started it.
    expect(r.pages).toBe(4);
    expect(r.stoppedBy).toBe('budget');
  });

  it('holds back the newest day in hand and resumes from it', async () => {
    const feed = fakeFeed(history, { direction: 'oldest-first', pageMs: 1000 });
    const r = await pullWindow(feed.fetchPage, { deadline: 2500, maxPages: 25, now: () => feed.clock.t });

    const inHand = [...history].slice(0, 2000);
    const newest = inHand.map(activityDay).sort().at(-1)!;
    expect(r.resumeFrom).toBe(newest);
    expect(r.matchedCount).toBe(inHand.filter((a) => activityDay(a) < newest).length);
    expect(r.mapped.trades.every((t) => t.date < newest)).toBe(true);
    // The swing lot opened on day two is open at the cut, so the next window reaches back to it.
    expect(r.mapped.oldestOpenDate).toBe(days(2)[1]);
  });

  it('stops at the page cap the same way', async () => {
    const feed = fakeFeed(history, { direction: 'oldest-first' });
    const r = await pullWindow(feed.fetchPage, { deadline: Number.POSITIVE_INFINITY, maxPages: 3, now: () => feed.clock.t });

    expect(r.pages).toBe(3);
    expect(r.partial).toBe(true);
    expect(r.stoppedBy).toBe('page-cap');
    expect(r.resumeFrom).toBeDefined();
  });

  it('makes no progress on a single day it cannot finish, rather than guessing at its pairing', async () => {
    // 2,000 fills on one day, one page affordable: nothing is matched, and the resume point is that day.
    const day = '2025-03-03';
    const oneDay: Row[] = [];
    for (let i = 0; i < 1100; i++) {
      oneDay.push(stock(`b${i}`, 'BUY', 1, 10, `${day}T14:30:00Z`), stock(`s${i}`, 'SELL', 1, 11, `${day}T14:31:00Z`));
    }
    const feed = fakeFeed(oneDay, { direction: 'oldest-first', pageMs: 1000 });

    const r = await pullWindow(feed.fetchPage, { deadline: 1500, maxPages: 25, now: () => feed.clock.t });

    expect(r.partial).toBe(true);
    expect(r.matchedCount).toBe(0);
    expect(r.mapped.trades).toEqual([]);
    expect(r.resumeFrom).toBe(day);
  });
});

describe('a newest-first feed', () => {
  const history = scalpedHistory(8, 250); // ~4,000 rows, four full pages and a short one

  it('is paged from its last offset, so what is in hand when time runs out is the oldest history', async () => {
    const feed = fakeFeed(history, { direction: 'newest-first', pageMs: 1000 });

    const r = await pullWindow(feed.fetchPage, { deadline: 3500, maxPages: 25, now: () => feed.clock.t });

    // The first page reads the direction; then the end of the feed, walking back.
    expect(feed.offsets).toEqual([0, 4000, 3000]);
    expect(r.partial).toBe(true);
    const oldestDays = days(8).slice(0, 3);
    expect(r.mapped.trades.every((t) => oldestDays.includes(t.date))).toBe(true);
    expect(r.mapped.trades.length).toBeGreaterThan(0);
  });

  it('is complete once the pages from the end meet the first page', async () => {
    const feed = fakeFeed(history, { direction: 'newest-first' });
    const r = await pullWindow(feed.fetchPage, { deadline: Number.POSITIVE_INFINITY, maxPages: 25, now: () => 0 });

    expect(r.partial).toBe(false);
    expect(feed.offsets).toEqual([0, 4000, 3000, 2000, 1000]);
    expect(byId(r)).toEqual(byId(await pullAll(history, 'oldest-first')));
  });

  it('matches nothing when its end cannot be found, rather than the wrong end', async () => {
    // No pagination total: the oldest history could be anywhere past the budget.
    const feed = fakeFeed(history, { direction: 'newest-first', pageMs: 1000, total: false });

    const r = await pullWindow(feed.fetchPage, { deadline: 2500, maxPages: 25, now: () => feed.clock.t });

    expect(r.partial).toBe(true);
    expect(r.stoppedBy).toBe('unknown-total');
    expect(r.matchedCount).toBe(0);
    expect(r.resumeFrom).toBeUndefined();
  });

  it('starts a resumed pull at the far end it was told to expect, and corrects from the true total', async () => {
    // The previous pull counted 2,500 rows left; 300 more have arrived at the front since.
    const feed = fakeFeed(history, { direction: 'newest-first', startDate: days(8)[2] });
    const r = await pullWindow(feed.fetchPage, {
      deadline: Number.POSITIVE_INFINITY,
      maxPages: 25,
      hint: 'newest-first',
      expectedTotal: 2500,
      now: () => 0,
    });

    const windowRows = history.filter((a) => activityDay(a) >= days(8)[2]).length;
    expect(feed.offsets[0]).toBe(2000);
    expect(feed.offsets).toEqual([2000, 3000, 1000, 0]);
    expect(r.partial).toBe(false);
    expect(r.activityCount).toBe(windowRows);
    expect(r.totalActivityCount).toBe(windowRows);
  });

  it('is read in full without a total when the budget allows', async () => {
    const feed = fakeFeed(history, { direction: 'newest-first', total: false });
    const r = await pullWindow(feed.fetchPage, { deadline: Number.POSITIVE_INFINITY, maxPages: 25, now: () => 0 });
    expect(r.partial).toBe(false);
    expect(byId(r)).toEqual(byId(await pullAll(history, 'oldest-first')));
  });

  it('uses a remembered direction for a first page that holds one day', async () => {
    // A brokerage with no time of day: every row carries the bare date, so nothing on the page
    // says which way the feed runs. Without the hint, read forward, every long becomes a short.
    const day = '2025-03-03';
    const oneDay: Row[] = [];
    for (let i = 0; i < 600; i++) {
      oneDay.push(stock(`b${i}`, 'BUY', 1, 10, day), stock(`s${i}`, 'SELL', 1, 11, day));
    }
    const feed = fakeFeed(oneDay, { direction: 'newest-first' });
    const r = await pullWindow(feed.fetchPage, { deadline: Number.POSITIVE_INFINITY, maxPages: 25, hint: 'newest-first', now: () => 0 });

    expect(r.partial).toBe(false);
    expect(r.direction).toBe('newest-first');
    expect(feed.offsets).toEqual([0, 1000]);
    expect(r.mapped.trades).toHaveLength(600);
    expect(r.mapped.trades.every((t) => t.side === 'long' && t.tradePrice === 10 && t.exitPrice === 11)).toBe(true);
  });
});

describe('the response size', () => {
  it('holds back the newest days until the trades fit in one answer', async () => {
    const history = scalpedHistory(6, 100);
    const full = await pullAll(history, 'oldest-first');
    const bytesForAll = JSON.stringify(full.mapped.trades).length;

    const feed = fakeFeed(history, { direction: 'oldest-first' });
    const r = await pullWindow(feed.fetchPage, {
      deadline: Number.POSITIVE_INFINITY,
      maxPages: 25,
      maxTradeBytes: Math.floor(bytesForAll / 2),
      now: () => 0,
    });

    expect(r.partial).toBe(true);
    expect(r.stoppedBy).toBe('response-size');
    expect(JSON.stringify(r.mapped.trades).length).toBeLessThanOrEqual(bytesForAll / 2);
    expect(r.resumeFrom).toBeDefined();
    expect(r.mapped.trades.every((t) => t.date < r.resumeFrom!)).toBe(true);
    expect(r.mapped.trades.length).toBeGreaterThan(0);
  });

  it('is capped under Netlify’s six-megabyte response limit', () => {
    expect(MAX_TRADE_BYTES).toBeLessThan(6 * 1024 * 1024);
    expect(MAX_TRADE_BYTES).toBeGreaterThan(4_000_000); // 8,790 Robinhood trades fit in one answer
  });
});

/*
 * The property everything above exists for.
 *
 * A history read in pieces — each piece cut by the clock, resumed by the plan in syncPlan.ts, and
 * widened back to whatever was still open — produces exactly the trades one uninterrupted pull
 * would, with the same P&L under the same sourceId. Anything else is a journal that disagrees with
 * the broker depending on how fast SnapTrade was answering that day.
 */
describe('a history read in pieces', () => {
  const history = scalpedHistory(12, 200); // ~4,800 rows, five pages, a swing trade across all of it

  async function readInPieces(
    direction: FeedDirection,
    budget: { pageMs: number; deadline: number } | { maxTradeBytes: number },
  ): Promise<{ trades: Map<string, number>; pulls: number; reasons: string[]; startDates: (string | undefined)[] }> {
    const trades = new Map<string, number>();
    const reasons: string[] = [];
    const startDates: (string | undefined)[] = [];
    let state: AccountSyncState | null = null;
    let pulls = 0;

    for (;;) {
      const plan = planSyncStart(undefined, state);
      reasons.push(plan.reason);
      startDates.push(plan.startDate);
      const feed = fakeFeed(history, { direction, startDate: plan.startDate, pageMs: 'pageMs' in budget ? budget.pageMs : 0 });
      const r = await pullWindow(feed.fetchPage, {
        deadline: 'deadline' in budget ? budget.deadline : Number.POSITIVE_INFINITY,
        maxPages: 25,
        hint: state?.feedDirection,
        // What the handler does with the plan: the carried lots seed the matcher, and the count of
        // rows left tells a newest-first pull where its far end is.
        openLots: plan.openLots as SnapTradeActivityLike[] | undefined,
        expectedTotal: plan.expectedRows,
        maxTradeBytes: 'maxTradeBytes' in budget ? budget.maxTradeBytes : undefined,
        now: () => feed.clock.t,
      });
      if (pulls > 0 && direction === 'newest-first' && 'pageMs' in budget) {
        // A resumed pull of a known newest-first feed never spends a page on the front.
        expect(feed.offsets[0]).not.toBe(0);
      }
      pulls += 1;
      for (const t of r.mapped.trades) {
        // The same fill must never come back with a different P&L — that is the duplicate-trade bug.
        if (trades.has(t.sourceId!)) expect(trades.get(t.sourceId!)).toBe(t.pnl);
        trades.set(t.sourceId!, t.pnl);
      }
      if (r.partial && r.matchedCount === 0) throw new Error(`no progress on pull ${pulls}`);
      state = nextSyncState({
        previous: state,
        startDate: plan.startDate,
        resumeFrom: r.resumeFrom,
        oldestOpenDate: r.mapped.oldestOpenDate,
        openLots: r.mapped.openLots,
        remainingRows: r.totalActivityCount === undefined ? undefined : r.totalActivityCount - r.matchedCount,
        observedDirection: r.mapped.observedDirection ?? r.direction,
        now: `2026-10-${String(10 + pulls).padStart(2, '0')}T11:00:00.000Z`,
      });
      if (!r.partial) return { trades, pulls, reasons, startDates };
      if (pulls > 20) throw new Error('never finished');
    }
  }

  it.each<FeedDirection>(['oldest-first', 'newest-first'])(
    'cut by the clock, a %s feed gives the same trades as one pull',
    async (direction) => {
      const full = byId(await pullAll(history, direction));
      const pieces = await readInPieces(direction, { pageMs: 1000, deadline: 2500 });

      expect(pieces.pulls).toBeGreaterThan(1);
      expect(pieces.reasons[0]).toBe('first-sync');
      expect(pieces.reasons.slice(1).every((r) => r === 'resuming')).toBe(true);
      expect(pieces.trades).toEqual(full);
      // The swing trade opened on day two and closed on day eleven paired across the cuts.
      expect(pieces.trades.has('snaptrade:swing-open:swing-close')).toBe(true);
    },
  );

  it('starts each resumed pull at the cut, carrying the open swing lot rather than re-reading it', async () => {
    /*
     * The first version of this reached back to the day before the oldest open position instead.
     * With the swing lot open from day two, every resumed pull re-read the same two pages from day
     * one, was cut at the same day, and the loop never finished — a position held for a year would
     * have done the same to a real account. The lots travel with the state now.
     */
    const pieces = await readInPieces('oldest-first', { pageMs: 1000, deadline: 2500 });
    const swingOpenDay = days(2)[1];
    const starts = pieces.startDates.slice(1) as string[];
    expect(starts.length).toBeGreaterThan(1);
    for (let i = 0; i < starts.length; i++) {
      expect(starts[i] > swingOpenDay).toBe(true);
      if (i > 0) expect(starts[i] > starts[i - 1]).toBe(true);
    }
  });

  it('falls back to reaching for the oldest open position when there are too many lots to carry', async () => {
    // The state refuses to carry them, so the plan widens to the oldest open lot instead.
    const state = nextSyncState({
      previous: null,
      startDate: undefined,
      resumeFrom: '2025-02-03',
      oldestOpenDate: '2025-01-07',
      openLots: Array.from({ length: 501 }, (_, i) => ({ id: `lot-${i}` })),
      observedDirection: null,
      now: '2026-10-11T11:00:00.000Z',
    });
    expect(state.openLots).toBeUndefined();
    expect(planSyncStart(undefined, state)).toEqual({ startDate: '2025-01-06', reason: 'resuming' });
  });

  it('cut by the response size, gives the same trades as one pull', async () => {
    const full = byId(await pullAll(history, 'oldest-first'));
    const bytes = JSON.stringify([...(await pullAll(history, 'oldest-first')).mapped.trades]).length;
    const pieces = await readInPieces('oldest-first', { maxTradeBytes: Math.floor(bytes / 3) });

    expect(pieces.pulls).toBeGreaterThan(2);
    expect(pieces.trades).toEqual(full);
  });
});

describe('cutUnfinishedDay', () => {
  it('keeps everything when the window is complete', () => {
    const rows = [stock('a', 'BUY', 1, 1, '2025-01-06T14:00:00Z'), stock('b', 'SELL', 1, 2, '2025-01-07T14:00:00Z')];
    expect(cutUnfinishedDay(rows, true)).toEqual({ activities: rows, resumeFrom: undefined });
  });

  it('cuts on the UTC day of the fill, which is the day the broker’s start date filters on', () => {
    // 01:00Z on the 8th is the evening of the 7th in New York. It is still held back with the 8th,
    // because startDate=2025-01-08 is what will bring it back.
    const rows = [
      stock('a', 'BUY', 1, 1, '2025-01-07T14:00:00Z'),
      stock('b', 'SELL', 1, 2, '2025-01-08T01:00:00Z'),
      stock('c', 'BUY', 1, 2, '2025-01-08T15:00:00Z'),
    ];
    expect(cutUnfinishedDay(rows, false)).toEqual({ activities: [rows[0]], resumeFrom: '2025-01-08' });
  });

  it('has no resume point for rows with no date', () => {
    expect(cutUnfinishedDay([{ id: 'x' }], false)).toEqual({ activities: [], resumeFrom: undefined });
  });
});
