import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tier } from '../config/tiers';

/*
 * /api/trade-paths: the minute bars behind a list of trades, from market replay's cache only.
 *
 * Driven through the real handler with Firestore faked and fetch made to fail, because the one
 * promise that matters is that this endpoint never buys data: it answers from what replay already
 * stored, and says "not stored" for everything else.
 */

let callerUid = 'trader';
let tier: Tier = 'diamond';
const store = new Map<string, Record<string, unknown>>();
let fetched = 0;

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>('../../server/snaptradeAuth');
  return { ...actual, assertCallerUid: async () => callerUid };
});
vi.mock('../../server/entitlements', async () => {
  const { limitsFor } = await vi.importActual<typeof import('../../src/config/tiers')>('../../src/config/tiers');
  return { resolveAccess: async () => ({ tier, limits: limitsFor(tier) }) };
});
vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));
vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => ({ get: async () => ({ exists: path === 'config/admin', data: () => ({ uid: 'jay' }) }) }),
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = store.get(`${name}/${id}`);
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  }),
}));

const T0 = Date.parse('2026-10-16T13:30:00Z') / 1000;
/** A cached session as server/marketReplay.ts stores it: columns, one bar a minute. */
const cached = (dataset: string, symbol: string, closes: number[]) =>
  store.set(`marketReplayBars/${dataset}|${symbol.replace(/\s+/g, '_')}|2026-10-16`, {
    t: closes.map((_, i) => T0 + i * 60),
    o: closes,
    h: closes.map((c) => c + 0.1),
    l: closes.map((c) => c - 0.1),
    c: closes,
    v: closes.map(() => 1),
  });

beforeEach(() => {
  callerUid = 'trader';
  tier = 'diamond';
  store.clear();
  fetched = 0;
  vi.stubGlobal('fetch', async () => {
    fetched += 1;
    throw new Error('this endpoint must never reach Databento');
  });
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

const load = () => import('../../server/tradePaths');
const headers = { authorization: 'Bearer t' };
const spx = { kind: 'option', date: '2026-10-16', underlying: 'SPX', expiration: '2026-10-16', right: 'C', strike: 5800, fills: [9.1] };

describe('trade paths', () => {
  it('is Diamond’s, like the replay it reads from', async () => {
    tier = 'gold';
    const { handleTradePathsRequest } = await load();
    expect((await handleTradePathsRequest(headers, { items: [spx] })).statusCode).toBe(403);
  });

  it('answers from the cache, picks the root the fills match, and never asks Databento', async () => {
    cached('OPRA.PILLAR', 'SPXW  261016C05800000', [4, 4.2]);
    cached('OPRA.PILLAR', 'SPX   261016C05800000', [9, 9.1]);
    cached('EQUS.MINI', 'CVX', [155.5, 156]);
    const { handleTradePathsRequest } = await load();
    const res = await handleTradePathsRequest(headers, { items: [spx, { kind: 'stock', date: '2026-10-16', symbol: 'cvx' }] });
    expect(res.statusCode).toBe(200);
    const items = res.body.items as { osi: string | null; stored: boolean; bars: { t0: number; m: number[]; c: number[] } }[];
    expect(items[0]).toMatchObject({ osi: 'SPX   261016C05800000', stored: true });
    expect(items[0].bars).toMatchObject({ t0: T0, m: [0, 1], c: [9, 9.1] });
    expect(items[1]).toMatchObject({ stored: true, bars: { c: [155.5, 156] } });
    expect(fetched).toBe(0);
  });

  it('says "not stored" for a day replay never opened, rather than buying it', async () => {
    const { handleTradePathsRequest } = await load();
    const res = await handleTradePathsRequest(headers, { items: [spx] });
    expect((res.body.items as { stored: boolean; bars: unknown }[])[0]).toMatchObject({ stored: false, bars: null });
    expect(fetched).toBe(0);
  });

  it('refuses a malformed item or more than a request can carry', async () => {
    const { handleTradePathsRequest } = await load();
    expect((await handleTradePathsRequest(headers, { items: [{ ...spx, right: 'X' }] })).statusCode).toBe(400);
    expect((await handleTradePathsRequest(headers, { items: [{ ...spx, date: '2026-10-17' }] })).statusCode).toBe(400);
    expect((await handleTradePathsRequest(headers, { items: Array.from({ length: 151 }, () => spx) })).statusCode).toBe(400);
  });
});
