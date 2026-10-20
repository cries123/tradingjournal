import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The market replay server: who gets bars, when, and what each request costs.
 *
 * Driven through the real handler with Databento and Firestore faked. What matters most: nobody is
 * shown a day before it is historical, nobody outside the plan (or, before launch, outside admin)
 * gets in, and every symbol-day is bought from Databento once.
 */

let callerUid = 'trader';
let tier: 'free' | 'diamond' = 'diamond';
let adminUid = 'jay';
const store = new Map<string, Record<string, unknown>>();
const spent: string[] = [];
const refunded: string[] = [];

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>('../../server/snaptradeAuth');
  return { ...actual, assertCallerUid: async () => callerUid };
});
vi.mock('../../server/entitlements', async () => {
  const { limitsFor } = await vi.importActual<typeof import('../../src/config/tiers')>('../../src/config/tiers');
  return { resolveAccess: async () => ({ tier, limits: limitsFor(tier) }) };
});
vi.mock('../../server/usage', () => ({
  consumeDaily: async (kind: string) => {
    spent.push(kind);
    return { ok: true, remaining: 39, source: 'daily', credits: 0 };
  },
  refundDaily: async (kind: string) => {
    refunded.push(kind);
  },
}));
vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));
vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: path === 'config/admin', data: () => ({ uid: adminUid }) }),
    }),
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
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

beforeEach(() => {
  calls = [];
  store.clear();
  spent.length = 0;
  refunded.length = 0;
  callerUid = 'trader';
  tier = 'diamond';
  adminUid = 'jay';
  respond = () => ({ status: 200, text: csv(1) });
  vi.stubEnv('DATABENTO_API_KEY', 'db-test-key');
  vi.stubGlobal('fetch', async (url: string, init: { body: URLSearchParams; headers: Record<string, string> }) => {
    calls.push({ url, body: init.body, auth: init.headers.Authorization });
    const r = respond(init.body.get('symbols') ?? '');
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

  it('refuses a plan below Diamond before buying anything', async () => {
    tier = 'free';
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', underlying: 'SPY', contracts: [] }, AFTER);
    expect(res.statusCode).toBe(403);
    expect(calls).toHaveLength(0);
    expect(spent).toHaveLength(0);
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
    expect(spent).toEqual(['replay']);
  });

  it('buys each symbol-day once: a second request is served from the cache and costs nothing', async () => {
    const { handleMarketReplayRequest } = await load();
    await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    const first = calls.length;
    const again = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(again.statusCode).toBe(200);
    expect(calls).toHaveLength(first);
    expect(spent).toEqual(['replay']);
  });

  it('reads a strike nobody listed as an empty day, and keeps it', async () => {
    respond = (symbol) => (symbol.startsWith('SPX') ? { status: 422, text: 'did not resolve' } : { status: 200, text: csv(581) });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(200);
    expect((res.body as { contracts: { osi: string | null }[] }).contracts[0].osi).toBeNull();
    expect([...store.keys()].some((k) => k.includes('SPXW'))).toBe(true);
  });

  it('hands the allowance back and caches nothing when Databento refuses the key', async () => {
    respond = () => ({ status: 401, text: 'bad key' });
    const { handleMarketReplayRequest } = await load();
    const res = await handleMarketReplayRequest(headers, { date: '2026-10-16', contracts: [spxCall] }, AFTER);
    expect(res.statusCode).toBe(502);
    expect(String(res.body.error)).toContain('refused');
    expect(refunded).toEqual(['replay']);
    expect(store.size).toBe(0);
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
