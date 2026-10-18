import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A large first sync, end to end through the real handler, against a SnapTrade that is slow.
 *
 * The case: a manual Robinhood sync pulled 11,491 activities over twelve serial pages, built 8,790
 * trades, wrote "8,790 trades out" into the trader's history — and had by then run past Netlify's
 * ten-second limit, so the browser got a 504 page and saved nothing. The sync had been charged
 * before the pull and the refund never ran, because the function was killed.
 *
 * Only SnapTrade, Firestore and the caller's identity are faked. The clock is faked too: each page
 * costs three seconds, and the handler is handed the deadline the Netlify function would hand it.
 */

type Row = {
  id: string;
  type: 'BUY' | 'SELL';
  units: number;
  price: number;
  fee: number;
  trade_date: string;
  symbol: { symbol: string };
  account: { id: string };
};

const { store, caller, feed } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  caller: { uid: 'user-1' },
  feed: {
    rows: [] as Row[],
    direction: 'oldest-first' as 'oldest-first' | 'newest-first',
    pageMs: 3000,
    requests: [] as { startDate?: string; offset?: number }[],
  },
}));

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>('../../server/snaptradeAuth');
  return { ...actual, assertCallerUid: async () => caller.uid };
});

vi.mock('../../server/snaptradeClient', () => ({
  SNAPTRADE_CONFIGURED: true,
  resolveBrokerSlug: async (broker: string) => broker,
  getSnaptrade: () => ({
    accountInformation: {
      listUserAccounts: async () => ({
        data: [{ id: 'acc-1', name: 'Individual', institution_name: 'Robinhood', brokerage_authorization: 'auth-1', number: '****1234' }],
      }),
      getAccountActivities: async (req: { startDate?: string; offset?: number; limit?: number }) => {
        feed.requests.push({ startDate: req.startDate, offset: req.offset });
        // The page costs time: the clock the handler reads moves on by it.
        vi.setSystemTime(Date.now() + feed.pageMs);
        const inWindow = req.startDate === undefined ? feed.rows : feed.rows.filter((r) => r.trade_date.slice(0, 10) >= req.startDate!);
        const ordered = feed.direction === 'newest-first' ? [...inWindow].reverse() : inWindow;
        const offset = req.offset ?? 0;
        const limit = req.limit ?? 1000;
        return { data: { data: ordered.slice(offset, offset + limit), pagination: { offset, limit, total: ordered.length } } };
      },
    },
    authentication: { registerSnapTradeUser: async () => ({ data: { userSecret: 'new-secret' } }) },
  }),
}));

vi.mock('../../server/entitlements', () => ({
  resolveAccess: async () => ({ tier: 'silver', limits: { brokers: Number.MAX_SAFE_INTEGER, syncsPerDay: 5 } }),
  readEntitlement: async () => null,
  trialUntil: () => null,
}));

vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));

/*
 * Firestore, as much of it as the sync touches: documents with get/set/update/create, collections
 * with add and an ordered read, and a transaction over documents. `set` with mergeFields replaces
 * the named top-level maps' entries and keeps their siblings, which is what the sync-state write
 * relies on to clear a finished resume point.
 */
let added = 0;
const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function docRef(path: string) {
  return {
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path), id: path.split('/').pop() }),
    set: async (value: Record<string, unknown>, options?: { merge?: boolean; mergeFields?: unknown[] }) => {
      const prev = store.get(path) ?? {};
      if (options?.mergeFields) {
        const next: Record<string, unknown> = { ...prev };
        for (const [k, v] of Object.entries(value)) next[k] = isMap(v) && isMap(prev[k]) ? { ...prev[k], ...v } : v;
        store.set(path, next);
      } else if (options?.merge) {
        store.set(path, { ...prev, ...value });
      } else {
        store.set(path, { ...value });
      }
    },
    update: async (patch: Record<string, unknown>) => {
      if (!store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
      const next = structuredClone(store.get(path)!);
      for (const [dotted, v] of Object.entries(patch)) {
        const keys = dotted.split('.');
        let at: Record<string, unknown> = next;
        for (const k of keys.slice(0, -1)) at = (at[k] = isMap(at[k]) ? at[k] : {}) as Record<string, unknown>;
        at[keys[keys.length - 1]] = v;
      }
      store.set(path, next);
    },
    create: async (value: Record<string, unknown>) => {
      if (store.has(path)) throw new Error('ALREADY_EXISTS');
      store.set(path, { ...value });
    },
    delete: async () => {
      store.delete(path);
    },
  };
}

function collectionRef(path: string) {
  const rows = () =>
    [...store.entries()]
      .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
      .map(([p, data]) => ({ id: p.slice(path.length + 1), data: () => data }));
  const query = (sortBy?: string, dir?: string, max?: number) => ({
    orderBy: (field: string, direction?: string) => query(field, direction, max),
    limit: (n: number) => query(sortBy, dir, n),
    get: async () => {
      let docs = rows();
      if (sortBy) {
        docs = docs.sort((a, b) => String(a.data()[sortBy]).localeCompare(String(b.data()[sortBy])));
        if (dir === 'desc') docs.reverse();
      }
      return { docs: max === undefined ? docs : docs.slice(0, max) };
    },
  });
  return {
    ...query(),
    add: async (value: Record<string, unknown>) => {
      added += 1;
      const id = `ev${String(added).padStart(4, '0')}`;
      store.set(`${path}/${id}`, { ...value });
      return { id };
    },
  };
}

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: docRef,
    collection: collectionRef,
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (ref: { path: string }) => ({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
        set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          store.set(ref.path, options?.merge ? { ...(store.get(ref.path) ?? {}), ...data } : { ...data });
        },
      }),
  }),
}));

import {
  DEFAULT_FUNCTION_LIMIT_MS,
  handleBrokerConnectRequest,
  RESERVE_AFTER_PULL_MS,
} from '../../server/brokerConnectHandler';
import { mapSnapTradeActivities } from '../../server/mapSnapTradeActivities';
import type { ParsedTradeInput } from '../types';
import type { AccountSyncState } from '../utils/syncPlan';
import type { JournalEvent } from '../utils/journalEvents';
import { usageDay } from '../../server/usage';

const HEADERS = { authorization: 'Bearer t' };
const START = new Date('2026-10-17T14:00:00.000Z');

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

/** Eleven days of scalping, ~3,700 rows over four pages, and a swing trade open across most of it. */
function history(): Row[] {
  const rows: Row[] = [];
  days(11).forEach((day, d) => {
    if (d === 1) rows.push(stock('swing-open', 'BUY', 5, 400, `${day}T14:31:00Z`, 'QQQ'));
    for (let i = 0; i < 170; i++) {
      const minute = String(35 + (i % 20)).padStart(2, '0');
      const hour = String(14 + Math.floor(i / 20)).padStart(2, '0');
      rows.push(stock(`b-${day}-${i}`, 'BUY', 10, 500 + i, `${day}T${hour}:${minute}:00Z`));
      rows.push(stock(`s-${day}-${i}`, 'SELL', 10, 501 + i, `${day}T${hour}:${minute}:30Z`));
    }
    if (d === 9) rows.push(stock('swing-close', 'SELL', 5, 420, `${day}T19:55:00Z`, 'QQQ'));
  });
  return rows;
}

const syncState = () => (store.get('users/user-1/private/brokerSync')?.accounts as Record<string, AccountSyncState>)['acc-1'];
const usage = () => store.get(`syncUsage/user-1_${usageDay()}`) as { count: number } | undefined;
const historyRows = () =>
  [...store.entries()]
    .filter(([p]) => p.startsWith('journalEvents/user-1/events/'))
    .map(([id, e]) => ({ id: id.split('/').pop()!, ...(e as unknown as JournalEvent) }));

type SyncBody = {
  trades: ParsedTradeInput[];
  partial: boolean;
  resumeFrom: string | null;
  pages: number;
  eventId: string | null;
  syncRefunded: boolean;
  syncRefundNotice: string | null;
  syncsRemaining: number;
  windowReason: string;
  activityCount: number;
};

/** A sync as the Netlify function issues it: the deadline is the function's limit from now. */
async function sync(): Promise<{ statusCode: number; body: SyncBody; tookMs: number }> {
  const began = Date.now();
  const res = await handleBrokerConnectRequest(HEADERS, { action: 'sync', accountId: 'acc-1' }, { deadline: began + DEFAULT_FUNCTION_LIMIT_MS });
  return { statusCode: res.statusCode, body: res.body as unknown as SyncBody, tookMs: Date.now() - began };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  store.clear();
  added = 0;
  caller.uid = 'user-1';
  feed.rows = history();
  feed.direction = 'oldest-first';
  feed.pageMs = 3000;
  feed.requests.length = 0;
  store.set('users/user-1/private/snaptrade', { userId: 'user-1', userSecret: 'secret' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a first sync too large for one function call', () => {
  it('answers inside the limit with the oldest part of the history, instead of dying at it', async () => {
    const { statusCode, body, tookMs } = await sync();

    expect(statusCode).toBe(200);
    // Two three-second pages fit under 10s − 2.5s of reserve; a third would have landed at 9s.
    expect(body.pages).toBe(2);
    expect(tookMs).toBeLessThanOrEqual(DEFAULT_FUNCTION_LIMIT_MS - RESERVE_AFTER_PULL_MS);
    expect(body.partial).toBe(true);
    expect(body.resumeFrom).toBe(days(6)[5]);
    expect(body.trades.length).toBeGreaterThan(0);
    expect(body.trades.every((t) => t.date < body.resumeFrom!)).toBe(true);
    expect(body.windowReason).toBe('first-sync');
  });

  it('is not charged, and says so', async () => {
    const { body } = await sync();

    expect(body.syncRefunded).toBe(true);
    expect(body.syncRefundNotice).toContain('could not finish');
    expect(body.syncsRemaining).toBe(5);
    expect(usage()?.count).toBe(0);
  });

  it('saves where it stopped, with the lot still open there', async () => {
    const { body } = await sync();
    const state = syncState();

    expect(state.complete).toBe(true);
    expect(state.resumeFrom).toBe(body.resumeFrom);
    expect(state.openLots).toEqual([expect.objectContaining({ id: 'swing-open', units: 5 })]);
    expect(state.oldestOpenDate).toBe(days(2)[1]);
  });

  it('records the row as partial, unconfirmed, and refunded', async () => {
    const { body } = await sync();
    const [row] = historyRows();

    expect(row.id).toBe(body.eventId);
    expect(row.sync).toMatchObject({
      institution: 'Robinhood',
      partial: true,
      resumeFrom: body.resumeFrom,
      stoppedBy: 'budget',
      tradesReturned: body.trades.length,
      landed: false,
      syncsRemaining: 5,
    });
  });
});

describe('the syncs after it', () => {
  /** Presses Sync until the history is read, checking each resumed pull against the state before it. */
  async function syncUntilDone(): Promise<{ syncs: number; trades: Map<string, number>; last: SyncBody }> {
    const first = await sync();
    const trades = new Map(first.body.trades.map((t) => [t.sourceId!, t.pnl]));
    let last = first.body;
    let syncs = 1;
    while (last.partial) {
      const before = syncState();
      feed.requests.length = 0;

      const next = await sync();

      // Exactly the resume point: no fortnight of overlap, no reaching back to the swing lot's open.
      expect(feed.requests[0].startDate).toBe(before.resumeFrom);
      expect(next.body.windowReason).toBe('resuming');
      for (const t of next.body.trades) {
        if (trades.has(t.sourceId!)) expect(trades.get(t.sourceId!)).toBe(t.pnl);
        trades.set(t.sourceId!, t.pnl);
      }
      last = next.body;
      syncs += 1;
      if (syncs > 10) throw new Error('never finished');
    }
    return { syncs, trades, last };
  }

  it('continue from the cut, seeded with the open lot, until the history is read', async () => {
    const { syncs, last } = await syncUntilDone();

    expect(syncs).toBeGreaterThan(1);
    expect(last.syncRefunded).toBe(false);
    expect(last.syncsRemaining).toBe(4); // only the sync that finished was charged

    const state = syncState();
    expect(state.complete).toBe(true);
    expect(state.resumeFrom).toBeUndefined();
    expect(state.openLots).toBeUndefined();
    expect(state.remainingRows).toBeUndefined();
  });

  it('give, together, exactly the trades one uninterrupted pull would', async () => {
    const { trades } = await syncUntilDone();

    const whole = new Map(mapSnapTradeActivities(feed.rows).trades.map((t) => [t.sourceId!, t.pnl]));
    expect(trades).toEqual(whole);
    // The swing trade, opened before the first cut and closed after the last, paired across them.
    expect(trades.get('snaptrade:swing-open:swing-close')).toBe(98);
  });

  it('work the same on a newest-first feed, paged from its far end', async () => {
    feed.direction = 'newest-first';
    const { syncs, trades } = await syncUntilDone();

    const whole = new Map(mapSnapTradeActivities(feed.rows).trades.map((t) => [t.sourceId!, t.pnl]));
    expect(trades).toEqual(whole);
    expect(syncs).toBeGreaterThan(2);
    // Known to run newest first after the first sync, so every later pull started at the far end.
    expect(feed.requests[0].offset).not.toBe(0);
  });
});

describe('a sync that fits', () => {
  it('reads everything, is charged, and leaves no resume point', async () => {
    feed.pageMs = 500;
    const { body } = await sync();

    expect(body.partial).toBe(false);
    expect(body.pages).toBe(4);
    expect(body.syncRefunded).toBe(false);
    expect(body.syncsRemaining).toBe(4);
    expect(syncState().resumeFrom).toBeUndefined();
    expect(historyRows()[0].sync).toMatchObject({ partial: false, resumeFrom: null, landed: false });
  });

  it('plans the deadline itself when the function does not hand one over', async () => {
    const res = await handleBrokerConnectRequest(HEADERS, { action: 'sync', accountId: 'acc-1' });
    expect((res.body as unknown as SyncBody).pages).toBe(2);
  });
});

describe('the browser confirming the save', () => {
  it('marks the row as landed, with how many were new', async () => {
    const { body } = await sync();

    const res = await handleBrokerConnectRequest(HEADERS, { action: 'imported', eventId: body.eventId!, fresh: 1204 });

    expect(res.statusCode).toBe(200);
    expect(historyRows()[0].sync).toMatchObject({ landed: true, fresh: 1204 });
    const history = await handleBrokerConnectRequest(HEADERS, { action: 'history' });
    expect((history.body.events as JournalEvent[])[0].sync?.landed).toBe(true);
  });

  it('refuses an id that is not one of ours, and a count that is not a count', async () => {
    const { body } = await sync();
    expect((await handleBrokerConnectRequest(HEADERS, { action: 'imported', eventId: '../x', fresh: 1 })).statusCode).toBe(400);
    expect((await handleBrokerConnectRequest(HEADERS, { action: 'imported', eventId: body.eventId!, fresh: -1 })).statusCode).toBe(400);
    expect((await handleBrokerConnectRequest(HEADERS, { action: 'imported', eventId: body.eventId!, fresh: 1.5 })).statusCode).toBe(400);
    expect(historyRows()[0].sync?.landed).toBe(false);
  });

  it('cannot confirm another trader’s row', async () => {
    const { body } = await sync();
    caller.uid = 'user-2';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await handleBrokerConnectRequest(HEADERS, { action: 'imported', eventId: body.eventId!, fresh: 9 });

    expect(res.statusCode).toBe(200); // best-effort, and there is nothing under user-2 to update
    expect(historyRows()[0].sync?.landed).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not confirm'), expect.anything());
    warn.mockRestore();
  });
});
