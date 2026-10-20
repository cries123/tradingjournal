import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { resolveAccess } from './entitlements';
import { getAdminFirestore } from './firebaseAdmin';
import { readReplayMonthSpend, recordReplayPull, replayPeriods, type ReplayPull } from './replayLedger';
import { logServerError } from './errorReports';
import { tierHas } from '../src/config/tiers';
import { monthShareSoFar, REPLAY_PACED_OUT, replayHasRoom, replayUsed } from '../src/utils/replayAllowance';
import {
  chartedUnderlying,
  isTradingDay,
  optionRoots,
  osiSymbol,
  pickContract,
  replayAvailable,
  replayAvailableAt,
  sessionWindow,
  type Bar,
  type Right,
} from '../src/utils/marketReplay';

/**
 * Market replay's data: one session of minute bars per instrument, bought from Databento once and
 * kept.
 *
 * Databento bills a historical request by its size in their binary encoding (a one-minute bar is a
 * 56-byte record, so a contract's whole day is about 22 KB), and it bills every request that reaches
 * it. So every (dataset, symbol, day) is fetched once, for whoever asks first, and served from
 * Firestore after that; a past day's bars never change, so the cache never expires. What a pull did
 * cost is asked of Databento itself (metadata.get_cost) and counted against the member's monthly
 * allowance (TierLimits.replayUsdPerMonth) and the admin panel's totals — see replayLedger.ts.
 *
 * Server-only on purpose: the API key never leaves this function, and the cache and ledger
 * collections have no security rule, which Firestore reads as deny.
 */

const DATABENTO_URL = 'https://hist.databento.com/v0/timeseries.get_range';
const COST_URL = 'https://hist.databento.com/v0/metadata.get_cost';
const DATABENTO_KEY = process.env.DATABENTO_API_KEY?.trim() ?? '';
export const REPLAY_CONFIGURED = Boolean(DATABENTO_KEY);

/** An ohlcv record in Databento's binary encoding, which is the size they bill. */
const BYTES_PER_BAR = 56;
/**
 * Dollars per byte when the cost endpoint does not answer: the rate it last answered with in this
 * container, else this deliberately high stand-in ($1 a GB). Databento publishes no per-GB rate for
 * options, and a guessed price should err toward the member's allowance, not toward the bill.
 */
const FALLBACK_USD_PER_BYTE = 1 / 1e9;
const observedRate = new Map<string, number>();

function databentoAuth(): string {
  return `Basic ${Buffer.from(`${DATABENTO_KEY}:`).toString('base64')}`;
}

/** OPRA: every US equity option, consolidated. */
const OPTIONS_DATASET = 'OPRA.PILLAR';
/** Databento US Equities Mini: consolidated top of book across the exchanges and ATSs. */
const EQUITY_DATASET = 'EQUS.MINI';

/** Contracts a screen can ask for at once: a busy day's traded contracts plus a few picked by hand. */
const MAX_CONTRACTS = 12;

const CACHE = 'marketReplayBars';

export interface ContractRequest {
  /** The broker's underlying, "SPX" or "SPY". */
  underlying: string;
  expiration: string;
  right: Right;
  strike: number;
  /** The trader's fill prices on it, to tell SPX from SPXW. Empty for a contract picked by hand. */
  fills?: number[];
}

export interface ReplayRequestBody {
  date?: unknown;
  /** The underlying to draw; defaults to the first contract's. */
  underlying?: unknown;
  contracts?: unknown;
}

export interface ReplayContract {
  /** Which request this answers, in order. */
  index: number;
  osi: string | null;
  bars: Bar[];
}

export interface ReplayResponse {
  date: string;
  sessionStart: number;
  sessionEnd: number;
  underlying: { symbol: string; proxyFor: string | null; bars: Bar[] } | null;
  contracts: ReplayContract[];
  /**
   * This month's replay data: how much the member has used and how much is released so far, both 0
   * to 1 of the month. Null for the site admin.
   */
  allowance: { used: number; available: number } | null;
}

/* ------------------------------------------------------------------ Databento */

/**
 * The CSV Databento sends, as bars.
 *
 * Asked for with pretty_px and pretty_ts, so prices are decimals and times ISO; both raw forms are
 * read too (fixed-point prices in billionths, nanosecond timestamps), because a response that
 * ignored a flag must not chart prices a billion times too big.
 */
export function parseBars(csv: string): Bar[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [iTs, iO, iH, iL, iC, iV] = ['ts_event', 'open', 'high', 'low', 'close', 'volume'].map(col);
  if ([iTs, iO, iH, iL, iC].some((i) => i < 0)) return [];

  const price = (raw: string) => {
    const n = Number(raw);
    return !raw.includes('.') && Math.abs(n) >= 1e6 ? n / 1e9 : n;
  };
  const seconds = (raw: string) => {
    if (/^\d{15,}$/.test(raw)) return Math.floor(Number(BigInt(raw) / 1_000_000_000n));
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
  };

  const bars: Bar[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const bar = {
      time: seconds(cells[iTs]),
      open: price(cells[iO]),
      high: price(cells[iH]),
      low: price(cells[iL]),
      close: price(cells[iC]),
      volume: iV >= 0 ? Number(cells[iV]) || 0 : 0,
    };
    if ([bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) bars.push(bar);
  }
  return bars.sort((a, b) => a.time - b.time);
}

class DatabentoError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DatabentoError';
    this.status = status;
  }
}

/** One symbol's session from Databento. An unknown or untraded symbol is an empty day, not an error. */
async function fetchSession(dataset: string, symbol: string, date: string): Promise<Bar[]> {
  const { start, end } = sessionWindow(date);
  const body = new URLSearchParams({
    dataset,
    symbols: symbol,
    schema: 'ohlcv-1m',
    start: start.toISOString(),
    end: end.toISOString(),
    stype_in: 'raw_symbol',
    encoding: 'csv',
    compression: 'none',
    pretty_px: 'true',
    pretty_ts: 'true',
  });
  const res = await fetch(DATABENTO_URL, {
    method: 'POST',
    headers: { Authorization: databentoAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (res.ok) return parseBars(text);
  // 422 is Databento's answer for a symbol that did not resolve on that day: a strike nobody listed.
  if (res.status === 422) return [];
  throw new DatabentoError(`Databento ${res.status} for ${dataset} ${symbol.trim()} ${date}: ${text.slice(0, 200)}`, res.status);
}

/**
 * What Databento charged for one symbol's session, in dollars.
 *
 * Asked of its own cost endpoint with the same query, which answers with a bare dollar amount. A
 * symbol that returned no bars was not billed. When the endpoint does not answer, the size is priced
 * at the last rate it gave, or the high stand-in, and marked as an estimate for the admin panel.
 */
async function priceSession(dataset: string, symbol: string, date: string, bars: number): Promise<{ usd: number; estimated: boolean }> {
  if (bars === 0) return { usd: 0, estimated: false };
  const bytes = bars * BYTES_PER_BAR;
  try {
    const { start, end } = sessionWindow(date);
    const res = await fetch(COST_URL, {
      method: 'POST',
      headers: { Authorization: databentoAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        dataset,
        symbols: symbol,
        schema: 'ohlcv-1m',
        start: start.toISOString(),
        end: end.toISOString(),
        stype_in: 'raw_symbol',
      }),
    });
    const text = (await res.text()).trim();
    const usd = Number(text);
    if (res.ok && text !== '' && Number.isFinite(usd) && usd >= 0) {
      observedRate.set(dataset, usd / bytes);
      return { usd, estimated: false };
    }
    console.warn(`[market-replay] cost endpoint answered ${res.status}: ${text.slice(0, 120)}`);
  } catch (err) {
    console.warn('[market-replay] cost endpoint failed:', err);
  }
  return { usd: bytes * (observedRate.get(dataset) ?? FALLBACK_USD_PER_BYTE), estimated: true };
}

/* ------------------------------------------------------------------ the cache */

function cacheId(dataset: string, symbol: string, date: string): string {
  return `${dataset}|${symbol.replace(/\s+/g, '_')}|${date}`;
}

interface CachedDay {
  dataset: string;
  symbol: string;
  date: string;
  /** Columns rather than objects: about half the size in a Firestore document. */
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  fetchedAt: string;
}

function toCached(dataset: string, symbol: string, date: string, bars: Bar[]): CachedDay {
  return {
    dataset,
    symbol,
    date,
    t: bars.map((b) => b.time),
    o: bars.map((b) => b.open),
    h: bars.map((b) => b.high),
    l: bars.map((b) => b.low),
    c: bars.map((b) => b.close),
    v: bars.map((b) => b.volume),
    fetchedAt: new Date().toISOString(),
  };
}

function fromCached(d: CachedDay): Bar[] {
  return d.t.map((time, i) => ({ time, open: d.o[i], high: d.h[i], low: d.l[i], close: d.c[i], volume: d.v[i] ?? 0 }));
}

/**
 * The sessions for a set of symbols, cached ones first and the rest from Databento, and what the
 * rest cost.
 *
 * `allowed` is called once, before the first Databento request, so a fully cached replay never
 * touches the allowance and is never refused by it.
 */
async function sessions(
  wanted: { dataset: string; symbol: string }[],
  date: string,
  allowed: () => void,
): Promise<{ bars: Map<string, Bar[]>; bought: ReplayPull | null }> {
  const db = getAdminFirestore();
  const out = new Map<string, Bar[]>();
  const unique = [...new Map(wanted.map((w) => [cacheId(w.dataset, w.symbol, date), w])).entries()];

  const snaps = await Promise.all(unique.map(([id]) => db.collection(CACHE).doc(id).get()));
  const missing: [string, { dataset: string; symbol: string }][] = [];
  unique.forEach(([id, w], i) => {
    const snap = snaps[i];
    if (snap.exists) out.set(id, fromCached(snap.data() as CachedDay));
    else missing.push([id, w]);
  });
  if (missing.length === 0) return { bars: out, bought: null };

  allowed();
  const fetched = await Promise.all(missing.map(([, w]) => fetchSession(w.dataset, w.symbol, date)));
  const [prices] = await Promise.all([
    Promise.all(missing.map(([, w], i) => priceSession(w.dataset, w.symbol, date, fetched[i].length))),
    ...missing.map(([id, w], i) => {
      out.set(id, fetched[i]);
      return db.collection(CACHE).doc(id).set(toCached(w.dataset, w.symbol, date, fetched[i]));
    }),
  ]);
  const bars = fetched.reduce((n, f) => n + f.length, 0);
  return {
    bars: out,
    bought: {
      usd: prices.reduce((sum, p) => sum + p.usd, 0),
      bytes: bars * BYTES_PER_BAR,
      bars,
      symbols: fetched.filter((f) => f.length > 0).length,
      estimated: prices.some((p) => p.estimated),
    },
  };
}

/* ------------------------------------------------------------------ the request */

function readContracts(input: unknown): ContractRequest[] | null {
  if (!Array.isArray(input) || input.length > MAX_CONTRACTS) return null;
  const out: ContractRequest[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const underlying = typeof raw?.underlying === 'string' ? raw.underlying.trim().toUpperCase() : '';
    const expiration = typeof raw?.expiration === 'string' ? raw.expiration.slice(0, 10) : '';
    const right = raw?.right === 'C' || raw?.right === 'P' ? raw.right : null;
    const strike = typeof raw?.strike === 'number' ? raw.strike : NaN;
    const fills = Array.isArray(raw?.fills) ? (raw.fills as unknown[]).filter((f): f is number => typeof f === 'number' && Number.isFinite(f)).slice(0, 20) : [];
    if (!/^[A-Z]{1,6}$/.test(underlying) || !right || !osiSymbol(underlying, expiration, right, strike)) return null;
    out.push({ underlying, expiration, right, strike, fills });
  }
  return out;
}

/**
 * Bars already in the cache for these symbols on a day, and nothing else: never asks Databento, so it
 * costs nothing. Symbols never bought are simply absent from the map. For the trade measurements in
 * server/tradePaths.ts, which only ever work from days somebody has already opened.
 */
export async function readCachedBars(dataset: 'options' | 'equities', symbols: string[], date: string): Promise<Map<string, Bar[]>> {
  const set = dataset === 'options' ? OPTIONS_DATASET : EQUITY_DATASET;
  const db = getAdminFirestore();
  const unique = [...new Set(symbols)];
  const snaps = await Promise.all(unique.map((s) => db.collection(CACHE).doc(cacheId(set, s, date)).get()));
  const out = new Map<string, Bar[]>();
  unique.forEach((s, i) => {
    if (snaps[i].exists) out.set(s, fromCached(snaps[i].data() as CachedDay));
  });
  return out;
}

export async function isSiteAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getAdminFirestore().doc('config/admin').get();
    return snap.exists && (snap.data() as { uid?: string }).uid === uid;
  } catch {
    return false;
  }
}

export async function handleMarketReplayRequest(
  headers: IncomingHttpHeaders,
  body: ReplayRequestBody,
  now: Date = new Date(),
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  if (!REPLAY_CONFIGURED) {
    return { statusCode: 503, body: { error: 'Market replay is not set up yet. Add DATABENTO_API_KEY.' } };
  }

  let uid: string;
  try {
    uid = await assertCallerUid(headers);
  } catch (err) {
    const status = err instanceof BrokerRequestError ? err.statusCode : 401;
    return { statusCode: status, body: { error: err instanceof Error ? err.message : 'Sign in required' } };
  }

  /*
   * Diamond's, through tierHas, which also carries MARKET_REPLAY_LIVE. The site admin can always open
   * it — how Jay tried it on his own journal before it was on the plan card — and is never held to the
   * monthly allowance, though his pulls are counted like anybody's.
   */
  const { tier, limits } = await resolveAccess(uid);
  const admin = await isSiteAdmin(uid);
  if (!tierHas(tier, 'marketReplay') && !admin) {
    return { statusCode: 403, body: { error: 'Market replay is part of Diamond.' } };
  }

  const date = typeof body.date === 'string' ? body.date : '';
  if (!isTradingDay(date)) return { statusCode: 400, body: { error: 'Pick a trading day.' } };
  if (!replayAvailable(date, now)) {
    return {
      statusCode: 409,
      body: { error: 'This day is not available to replay yet.', availableAt: replayAvailableAt(date).toISOString() },
    };
  }

  const contracts = readContracts(body.contracts ?? []);
  if (!contracts) return { statusCode: 400, body: { error: `Up to ${MAX_CONTRACTS} contracts, each with an underlying, expiration, strike and C or P.` } };

  const underlyingName = typeof body.underlying === 'string' && body.underlying.trim() ? body.underlying : contracts[0]?.underlying;
  const charted = underlyingName ? chartedUnderlying(underlyingName) : null;

  // Every candidate root per contract (SPX may be SPXW or SPX), plus the underlying.
  const candidates = contracts.map((c) =>
    optionRoots(c.underlying)
      .map((root) => osiSymbol(root, c.expiration, c.right, c.strike))
      .filter((s): s is string => s !== null),
  );
  const wanted = [
    ...candidates.flat().map((symbol) => ({ dataset: OPTIONS_DATASET, symbol })),
    ...(charted ? [{ dataset: EQUITY_DATASET, symbol: charted.symbol }] : []),
  ];

  // Read before anything is bought. A ledger that cannot be read refuses new data rather than guess
  // at somebody's month; days already cached are refused too, which a moment's retry fixes.
  let spent: number;
  try {
    spent = await readReplayMonthSpend(uid, now);
  } catch (err) {
    await logServerError('market-replay-ledger', err, { uid });
    return { statusCode: 503, body: { error: 'Replay is briefly unavailable. Try again in a moment.' } };
  }
  // Released a day at a time so it lasts the month; what a member has not used carries forward.
  const allowance = limits.replayUsdPerMonth;
  const shareSoFar = monthShareSoFar(replayPeriods(now).day);
  const allowed = () => {
    if (!admin && !replayHasRoom(spent, allowance, shareSoFar)) throw new BrokerRequestError(REPLAY_PACED_OUT, 429);
  };

  let got: Map<string, Bar[]>;
  try {
    const result = await sessions(wanted, date, allowed);
    got = result.bars;
    if (result.bought) {
      await recordReplayPull(uid, result.bought, now);
      spent += result.bought.usd;
    }
  } catch (err) {
    if (err instanceof BrokerRequestError) return { statusCode: err.statusCode, body: { error: err.message } };
    // Nothing is counted for a request Databento did not answer: the ledger only records a pull once
    // its bars are in hand.
    await logServerError('market-replay', err, { uid });
    const keyRefused = err instanceof DatabentoError && (err.status === 401 || err.status === 403);
    return {
      statusCode: 502,
      body: { error: keyRefused ? 'The market data provider refused the request. The site owner has been told.' : 'Market data is unavailable right now. Try again shortly.' },
    };
  }

  const bars = (dataset: string, symbol: string) => got.get(cacheId(dataset, symbol, date)) ?? [];
  const { start, end } = sessionWindow(date);
  const response: ReplayResponse = {
    date,
    sessionStart: Math.floor(start.getTime() / 1000),
    sessionEnd: Math.floor(end.getTime() / 1000),
    underlying: charted ? { ...charted, bars: bars(EQUITY_DATASET, charted.symbol) } : null,
    contracts: contracts.map((c, index) => {
      const options = candidates[index].map((osi) => ({ osi, bars: bars(OPTIONS_DATASET, osi) }));
      const osi = pickContract(options, c.fills ?? []);
      return { index, osi, bars: osi ? bars(OPTIONS_DATASET, osi) : [] };
    }),
    // Null for the site admin, who has no allowance to show.
    allowance: admin ? null : { used: replayUsed(spent, allowance), available: shareSoFar },
  };
  return { statusCode: 200, body: response as unknown as Record<string, unknown> };
}
