import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tier } from '../config/tiers';

/*
 * The market replay server: who gets bars, when, and what each request costs.
 *
 * Driven through the real handler with Databento and Firestore faked. What matters most: nobody is
 * shown a day before it is historical, nobody outside Diamond gets in (bar the site admin), every
 * symbol-day is bought from Databento once, and a member's monthly data allowance — released a day
 * at a time — stops new pulls without ever stopping a replay of a day already cached.
 */

let callerUid = 'trader';
let tier: Tier = 'diamond';
let adminUid = 'jay';
const store = new Map<string, Record<string, unknown>>();
let failLedger = false;
const pulls: { uid: string; pull: { usd: number; bytes: number; bars: number; symbols: number; estimated: boolean } }[] = [];

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>('../../server/snaptradeAuth');
  return { ...actual, assertCallerUid: async () => callerUid };
});
vi.mock('../../server/entitlements', async () => {
  const { limitsFor } = await vi.importActual<typeof import('../../src/config/tiers')>('../../src/config/tiers');
  return { resolveAccess: async () => ({ tier, limits: limitsFor(tier) }) };
});
// The real month reader against the fake store; the batch write captured instead.
vi.mock('../../server/replayLedger', async () => {
  const actual = await vi.importActual<typeof import('../../server/replayLedger')>('../../server/replayLedger');
  return {
    ...actual,
    recordReplayPull: async (uid: string, pull: (typeof pulls)[number]['pull']) => {
      pulls.push({ uid, pull });
    },
  };
});
vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));
vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: path === 'config/admin', data: () => ({ uid: adminUid }) }),
    }),
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (failLedger && name === 'replayMonths') throw new Error('Firestore unavailable');
          const data = store.get(`${name}/${id}`);
          return { exists: data !== undefined, data: () => data };
        },
        set: async (value: Record<string, unknown>) => {
          store.set(`${name}/${id}`, value);
        },
      }),
    }),
  }),
}));

/** Databento's CSV for one minute bar, with pretty prices and times. */
const csv = (close: number) =>
  `ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume\n2026-10-16T13:31:00.000000000Z,33,1,123,${close},${close + 0.2},${close - 0.2},${close},12\n`;

let calls: { url: string; body: URLSearchParams; auth: string }[] = [];
let respond: (symbol: string) => { status: number; text: string } = () => ({ status: 200, text: csv(1) });
/** Databento's cost endpoint: a bare dollar amount per symbol, as it answers. */
let costCalls: string[] = [];
let price: (symbol: string) => { status: number; text: string } = () => ({ status: 200, text: '0.002' });

beforeEach(() => {
  calls = [];
  costCalls = [];
  store.clear();
  failLedger = false;
  pulls.length = 0;
  callerUid = 'trader';
  tier = 'diamond';
  adminUid = 'jay';
  respond = () => ({ status: 200, text: csv(1) });
  price = () => ({ status: 200, text: '0.002' });
  vi.stubEnv('DATABENTO_API_KEY', 'db-test-key');
  vi.stubGlobal('fetch', async (url: string, init: { body: URLSearchParams; headers: Record<string, string> }) => {
    const symbol = init.body.get('symbols') ?? '';
    if (url.includes('metadata.get_cost')) {
      costCalls.push(symbol);
      const p = price(symbol);
      return new Response(p.text, { status: p.status });
    }
    calls.push({ url, body: init.body, auth: init.headers.Authorization });
    const r = respond(symbol);
    return new Response(r.text, { status: r.status });
  });
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const load = () => import('../../server/marketReplay');
const AFTER = new Date('2026-10-20T15:00:00Z'); // Tuesday: Friday 16 Oct is historical
const headers = { authorization: 'Bearer t' };
const spxCall = { underlying: 'SPX', expiration: '2026-10-16', right: 'C', strike: 5800, fills: [9.1] };

describe('who may replay', () => {
  it('opens to a Diamond member', async () => {
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', underlying: 'SPY', contracts: [] }, AFTER);
    expect(res.statusCode).toBe(200);
  });

  it('refuses every plan below Diamond before buying anything', async () => {
    const { handleMarketReplayRequest } = await load();
    for (const below of ['free', 'silver', 'gold'] as const) {
      tier = below;
      const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', underlying: 'SPY', contracts: [] }, AFTER);
      expect(res.statusCode, below).toBe(403);
    }
    expect(calls).toHaveLength(0);
    expect(pulls).toHaveLength(0);
  });

  it('lets the site admin in on any plan, so the owner can always check it', async () => {
    callerUid = 'jay';
    tier = 'free';
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', underlying: 'SPY', contracts: [] }, AFTER);
    expect(res.statusCode).toBe(200);
  });

  it('says it is not set up without a Databento key', async () => {
    vi.stubEnv('DATABENTO_API_KEY', '');
    const { handleMarketReplayRequest } = await load();
    expect((await handleMarketReplayRequest(headers, { date: '2026-10-16' }, AFTER)).statusCode).toBe(503);
  });
});

describe('what may be replayed', () => {
  beforeEach(() => {
    callerUid = 'jay';
  });

  it('refuses a day that is not yet historical, and says when it opens', async () => {
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-19', contracts: [] }, AFTER);
    expect(res.statusCode).toBe(409);
    expect(res.body.availableAt).toBe('2026-10-20T20:15:00.000Z');
    expect(calls).toHaveLength(0);
  });

  it('refuses a weekend, a malformed contract, and more than twelve contracts', async () => {
    const { handleMarketReplayRequest } = await load();
    expect((await handleMarketReplayRequest(headers, { date: '2026-10-17' }, AFTER)).statusCode).toBe(400);
    expect((await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [{ ...spxCall, right: 'X' }] }, AFTER)).statusCode).toBe(400);
    const many = Array.from({ length: 13 }, (_, i) => ({ ...spxCall, strike: 5800 + i * 5 }));
    expect((await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: many }, AFTER)).statusCode).toBe(400);
  });
});

describe('the bars', () => {
  beforeEach(() => {
    callerUid = 'jay';
  });

  it('asks Databento for both SPX roots and SPY, with the key as basic auth, and picks the root the fills match', async () => {
    respond = (symbol) => ({ status: 200, text: symbol.startsWith('SPX ') ? csv(9) : symbol.startsWith('SPXW') ? csv(4) : csv(581) });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    expect(calls.map((c) => c.body.get('symbols')).sort()).toEqual(['SPX   261016C05800000', 'SPXW  261016C05800000', 'SPY']);
    expect(calls.every((c) => c.url === 'https://hist.databento.com/v0/timeseries.get_range')).toBe(true);
    expect(calls[0].auth).toBe(`Basic ${Buffer.from('db-test-key:').toString('base64')}`);
    expect(calls[0].body.get('schema')).toBe('ohlcv-1m');
    const body = res.body as { contracts: { osi: string; bars: { close: number }[] }[]; underlying: { symbol: string; proxyFor: string } };
    expect(body.contracts[0].osi).toBe('SPX   261016C05800000');
    expect(body.underlying).toMatchObject({ symbol: 'SPY', proxyFor: 'SPX' });
    // One pull, priced symbol by symbol by Databento's own cost endpoint.
    expect(costCalls.sort()).toEqual(['SPX   261016C05800000', 'SPXW  261016C05800000', 'SPY']);
    expect(pulls).toHaveLength(1);
    expect(pulls[0].pull).toMatchObject({ bars: 3, bytes: 168, symbols: 3, estimated: false });
    expect(pulls[0].pull.usd).toBeCloseTo(0.006, 9);
  });

  it('buys each symbol-day once: a second request is served from the cache and costs nothing', async () => {
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    const first = calls.length;
    const again = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(again.statusCode).toBe(200);
    expect(calls).toHaveLength(first);
    expect(pulls).toHaveLength(1);
  });

  it('reads a strike nobody listed as an empty day, and keeps it', async () => {
    respond = (symbol) => (symbol.startsWith('SPX') ? { status: 422, text: 'did not resolve' } : { status: 200, text: csv(581) });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    expect((res.body as { contracts: { osi: string | null }[] }).contracts[0].osi).toBeNull();
    expect([...store.keys()].some((k) => k.includes('SPXW'))).toBe(true);
    // Nothing came back for the strikes, so nothing was billed for them and nothing is priced.
    expect(costCalls).toEqual(['SPY']);
    expect(pulls[0].pull.symbols).toBe(1);
  });

  it('counts nothing and caches nothing when Databento refuses the key', async () => {
    respond = () => ({ status: 401, text: 'bad key' });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(502);
    expect(String(res.body.error)).toContain('refused');
    expect(pulls).toHaveLength(0);
    expect(store.size).toBe(0);
  });

  it('prices a pull at a deliberately high rate, marked as an estimate, when the cost endpoint fails', async () => {
    price = () => ({ status: 500, text: 'down' });
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(pulls[0].pull.estimated).toBe(true);
    // Three one-minute bars at 56 bytes, at $1 a GB.
    expect(pulls[0].pull.usd).toBeCloseTo((3 * 56) / 1e9, 15);
  });
});

describe('the monthly data allowance', () => {
  // 20 October of a 31-day month: 20/31 of the $20 is open, about $12.90.
  const month = 'replayMonths/trader_2026-10';

  it('lets a member pull while under the share open so far, and says how much is used', async () => {
    store.set(month, { usd: 5 });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    const allowance = (res.body as { allowance: { used: number; available: number } }).allowance;
    expect(allowance.used).toBeCloseTo(5.006 / 20, 9);
    expect(allowance.available).toBeCloseTo(20 / 31, 9);
    expect(pulls).toHaveLength(1);
  });

  it('refuses new data past the share open so far, before asking Databento for anything', async () => {
    store.set(month, { usd: 13 });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(429);
    expect(String(res.body.error)).toContain('tomorrow');
    expect(calls).toHaveLength(0);
    expect(pulls).toHaveLength(0);
  });

  it('still plays a day already opened once the allowance is used up', async () => {
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    const bought = calls.length;
    store.set(month, { usd: 20 });
    const again = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(again.statusCode).toBe(200);
    expect(calls).toHaveLength(bought);
    // A new contract on the same day is new data, and that is refused.
    const other = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [{ ...spxCall, strike: 5805 }] }, AFTER);
    expect(other.statusCode).toBe(429);
  });

  it('never holds the site admin to it, though his pulls are counted', async () => {
    callerUid = 'jay';
    store.set('replayMonths/jay_2026-10', { usd: 50 });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    expect((res.body as { allowance: unknown }).allowance).toBeNull();
    expect(pulls.map((p) => p.uid)).toEqual(['jay']);
  });

  it('refuses new data rather than guess when the month cannot be read', async () => {
    failLedger = true;
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

describe('reading Databento’s CSV', () => {
  it('reads pretty prices and times, and the raw fixed-point forms too', async () => {
    const { parseBars } = await load();
    const pretty = parseBars(csv(4.25));
    expect(pretty[0]).toMatchObject({ open: 4.25, close: 4.25, volume: 12, time: Date.parse('2026-10-16T13:31:00Z') / 1000 });
    const raw = parseBars('ts_event,open,high,low,close,volume\n1792157460000000000,4250000000,4450000000,4050000000,4250000000,7\n');
    expect(raw[0]).toMatchObject({ open: 4.25, high: 4.45, time: 1792157460, volume: 7 });
    expect(parseBars('')).toEqual([]);
  });
});
