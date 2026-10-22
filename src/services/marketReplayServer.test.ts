import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tier } from '../config/tiers';

/*
 * The market replay server: who gets bars, when, and what each request costs.
 *
 * Driven through the real handler and the real ledger, with Databento and Firestore faked. What
 * matters most: nobody is shown a day before it is historical, nobody outside Diamond gets in (bar
 * the site admin), every symbol-day is bought from Databento once, every purchase is counted at
 * Databento's price, and a member's allowance — $20 a month, split evenly across its days — stops
 * new pulls without ever stopping a replay of a day already cached.
 */

let callerUid = 'trader';
let tier: Tier = 'diamond';
let adminUid = 'jay';
const store = new Map<string, Record<string, unknown>>();
let failLedger = false;
let failCache = false;
let siteWrites: string[] = [];

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>('../../server/snaptradeAuth');
  return { ...actual, assertCallerUid: async () => callerUid };
});
vi.mock('../../server/entitlements', async () => {
  const { limitsFor } = await vi.importActual<typeof import('../../src/config/tiers')>('../../src/config/tiers');
  return { resolveAccess: async () => ({ tier, limits: limitsFor(tier) }) };
});
vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));
vi.mock('../../server/firebaseAdmin', () => {
  const docRef = (name: string, id: string) => ({
    path: `${name}/${id}`,
    get: async () => {
      if (failLedger && name === 'replayMonths') throw new Error('Firestore unavailable');
      const data = store.get(`${name}/${id}`);
      return { exists: data !== undefined, data: () => data };
    },
    set: async (value: Record<string, unknown>) => {
      if (failCache && name === 'marketReplayBars') throw new Error('write refused');
      store.set(`${name}/${id}`, value);
    },
  });
  type Ref = ReturnType<typeof docRef>;
  return {
    getAdminFirestore: () => ({
      doc: (path: string) => ({
        get: async () => ({ exists: path === 'config/admin', data: () => ({ uid: adminUid }) }),
      }),
      collection: (name: string) => ({ doc: (id: string) => docRef(name, id) }),
      // Sequential, which is all a single request needs: read, decide, write.
      runTransaction: async <T,>(fn: (tx: { get: (r: Ref) => ReturnType<Ref['get']>; set: (r: Ref, v: Record<string, unknown>) => void }) => Promise<T>) => {
        const writes: [Ref, Record<string, unknown>][] = [];
        const result = await fn({ get: (r) => r.get(), set: (r, v) => void writes.push([r, v]) });
        for (const [r, v] of writes) await r.set(v);
        return result;
      },
      batch: () => ({ set: (r: Ref) => void siteWrites.push(r.path), commit: async () => undefined }),
    }),
  };
});

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
  siteWrites = [];
  store.clear();
  failLedger = false;
  failCache = false;
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
const TODAY = '2026-10-20';
const headers = { authorization: 'Bearer t' };
const spxCall = { underlying: 'SPX', expiration: '2026-10-16', right: 'C', strike: 5800, fills: [9.1] };
/** A member's month in the ledger. */
const month = (uid: string) => store.get(`replayMonths/${uid}_2026-10`) as Record<string, number & Record<string, unknown>> | undefined;

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
    expect(month('trader')).toBeUndefined();
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

describe('the bars, and what they cost', () => {
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
  });

  it('counts the pull at Databento’s own price on the member’s day and month, and on the site totals', async () => {
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(costCalls.sort()).toEqual(['SPX   261016C05800000', 'SPXW  261016C05800000', 'SPY']);
    const m = month('jay')!;
    expect(m).toMatchObject({ bars: 3, bytes: 168, symbols: 3, pulls: 1, estimatedPulls: 0, pending: {} });
    expect(m.usd).toBeCloseTo(0.006, 9);
    expect((m.days as unknown as Record<string, number>)[TODAY]).toBeCloseTo(0.006, 9);
    expect(siteWrites.sort()).toEqual(['replayStats/2026-10-20', 'replayStats/month-2026-10']);
  });

  it('buys each symbol-day once: a second request is served from the cache and counts nothing', async () => {
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    const first = calls.length;
    const again = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(again.statusCode).toBe(200);
    expect(calls).toHaveLength(first);
    expect(month('jay')!.pulls).toBe(1);
  });

  it('reads a strike nobody listed as an empty day, keeps it, and prices only what came back', async () => {
    respond = (symbol) => (symbol.startsWith('SPX') ? { status: 422, text: 'did not resolve' } : { status: 200, text: csv(581) });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    expect((res.body as { contracts: { osi: string | null }[] }).contracts[0].osi).toBeNull();
    expect([...store.keys()].some((k) => k.includes('SPXW'))).toBe(true);
    expect(costCalls).toEqual(['SPY']);
    expect(month('jay')!.symbols).toBe(1);
  });

  it('counts nothing, caches nothing, and hands the reservation back when Databento refuses the key', async () => {
    respond = () => ({ status: 401, text: 'bad key' });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(502);
    expect(String(res.body.error)).toContain('refused');
    expect([...store.keys()].filter((k) => k.startsWith('marketReplayBars/'))).toHaveLength(0);
    // toEqual, not toMatchObject: an object pattern of {} matches a reservation left behind.
    expect(month('jay')!.pending).toEqual({});
    expect(month('jay')!.usd).toBeUndefined();
  });

  it('prices a pull from Databento’s real rate, marked as an estimate, when the cost endpoint fails', async () => {
    price = () => ({ status: 500, text: 'down' });
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(month('jay')!.estimatedPulls).toBe(1);
    // Three one-minute bars at 56 bytes, at $0.30 a MB: a little above the $0.256 Jay was billed.
    expect(month('jay')!.usd).toBeCloseTo((3 * 56 * 0.3) / 1e6, 12);
  });

  it('still returns and still counts bars Databento billed for when the cache write fails', async () => {
    failCache = true;
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    expect((res.body as { contracts: { bars: unknown[] }[] }).contracts[0].bars).toHaveLength(1);
    expect(month('jay')!.pulls).toBe(1);
  });
});

describe('the allowance: $20 a month, split evenly across its days', () => {
  // 20 October, a 31-day month: about 64.5¢ a day.
  const key = 'replayMonths/trader_2026-10';

  it('lets a member pull while under today’s share, and says how much of the day and month is used', async () => {
    store.set(key, { uid: 'trader', month: '2026-10', usd: 5, days: { [TODAY]: 0.1 } });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    const allowance = (res.body as { allowance: { today: number; month: number } }).allowance;
    expect(allowance.today).toBeCloseTo(0.106 / (20 / 31), 9);
    expect(allowance.month).toBeCloseTo(5.006 / 20, 9);
  });

  it('refuses new data past today’s share even early in a month left untouched, before asking Databento', async () => {
    store.set(key, { usd: 0.65, days: { [TODAY]: 0.65 } });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(429);
    expect(String(res.body.error)).toContain('midnight Eastern');
    expect(calls).toHaveLength(0);
  });

  it('refuses new data once the month is spent, whatever today looks like', async () => {
    store.set(key, { usd: 20, days: {} });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(429);
    expect(String(res.body.error)).toContain('on the 1st');
  });

  it('counts a pull already in flight, so a second request at the same moment cannot slip under', async () => {
    const inFlight = { usd: 0.6, at: new Date(AFTER.getTime() - 5_000).toISOString() };
    store.set(key, { usd: 0.1, days: { [TODAY]: 0.1 }, pending: { other: inFlight } });
    const { handleMarketReplayRequest } = await load();
    expect((await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER)).statusCode).toBe(429);
    // A reservation from a request that died long ago no longer holds anything.
    store.set(key, { usd: 0.1, days: { [TODAY]: 0.1 }, pending: { other: { ...inFlight, at: '2026-10-20T14:00:00.000Z' } } });
    expect((await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER)).statusCode).toBe(200);
    expect(month('trader')!.pending).toEqual({});
  });

  it('still plays a day already opened once the allowance is used up', async () => {
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    const bought = calls.length;
    store.set(key, { usd: 20, days: { [TODAY]: 20 } });
    const again = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(again.statusCode).toBe(200);
    expect(calls).toHaveLength(bought);
    // A new contract on the same day is new data, and that is refused.
    const other = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [{ ...spxCall, strike: 5805 }] }, AFTER);
    expect(other.statusCode).toBe(429);
  });

  it('never holds the site admin to it, though his pulls are counted', async () => {
    callerUid = 'jay';
    store.set('replayMonths/jay_2026-10', { usd: 50, days: { [TODAY]: 50 } });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    expect((res.body as { allowance: unknown }).allowance).toBeNull();
    expect(month('jay')!.usd).toBeCloseTo(50.006, 9);
  });

  it('refuses new data rather than guess when the ledger cannot be read, but still plays a cached day', async () => {
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    const bought = calls.length;
    failLedger = true;
    const cached = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(cached.statusCode).toBe(200);
    expect((cached.body as { allowance: unknown }).allowance).toBeNull();
    const fresh = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [{ ...spxCall, strike: 5805 }] }, AFTER);
    expect(fresh.statusCode).toBe(503);
    expect(calls).toHaveLength(bought);
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
