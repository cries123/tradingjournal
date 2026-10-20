import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { resolveAccess } from './entitlements';
import { getAdminFirestore } from './firebaseAdmin';
import { consumeDaily, refundDaily } from './usage';
import { logServerError } from './errorReports';
import { MARKET_REPLAY_LIVE } from '../src/config/tiers';
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
 * The cost is per byte and tiny (a contract's whole day is about 22 KB, against OPRA's $0.04/GB),
 * but it is per byte for every request that reaches Databento, so every (dataset, symbol, day) is
 * fetched once, for whoever asks first, and served from Firestore after that. A past day's bars
 * never change, so the cache never expires.
 *
 * Server-only on purpose: the API key never leaves this function, and the cache collection has no
 * security rule, which Firestore reads as deny.
 */

const DATABENTO_URL = 'https://hist.databento.com/v0/timeseries.get_range';
const DATABENTO_KEY = process.env.DATABENTO_API_KEY?.trim() ?? '';
export const REPLAY_CONFIGURED = Boolean(DATABENTO_KEY);

/** OPRA: every US equity option, consolidated. */
const OPTIONS_DATASET = 'OPRA.PILLAR';
/** Databento US Equities Mini: consolidated top of book across the exchanges and ATSs. */
const EQUITY_DATASET = 'EQUS.MINI';

/** Contracts a screen can ask for at once: a busy day's traded contracts plus a few picked by hand. */
const MAX_CONTRACTS = 12;
/**
 * Requests a day that may go to Databento. Cached days are free and do not count. Forty days of a
 * dozen contracts is about 10 MB, well under a cent; the cap is there for a script, not a trader.
 */
const REPLAY_FETCHES_PER_DAY = 40;

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
    headers: {
      Authorization: `Basic ${Buffer.from(`${DATABENTO_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const text = await res.text();
  if (res.ok) return parseBars(text);
  // 422 is Databento's answer for a symbol that did not resolve on that day: a strike nobody listed.
  if (res.status === 422) return [];
  throw new DatabentoError(`Databento ${res.status} for ${dataset} ${symbol.trim()} ${date}: ${text.slice(0, 200)}`, res.status);
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
 * The sessions for a set of symbols, cached ones first and the rest from Databento.
 *
 * `spend` is called once, before the first Databento request, so a fully cached replay costs the
 * trader nothing from their allowance.
 */
async function sessions(
  wanted: { dataset: string; symbol: string }[],
  date: string,
  spend: () => Promise<void>,
): Promise<Map<string, Bar[]>> {
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
  if (missing.length === 0) return out;

  await spend();
  const fetched = await Promise.all(missing.map(([, w]) => fetchSession(w.dataset, w.symbol, date)));
  await Promise.all(
    missing.map(([id, w], i) => {
      out.set(id, fetched[i]);
      return db.collection(CACHE).doc(id).set(toCached(w.dataset, w.symbol, date, fetched[i]));
    }),
  );
  return out;
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

async function isSiteAdmin(uid: string): Promise<boolean> {
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
   * The plan grants it (Diamond) once MARKET_REPLAY_LIVE is on. The site admin can always open it,
   * which is how Jay tried it on his own journal before it was on the plan card.
   */
  const { limits } = await resolveAccess(uid);
  const admin = await isSiteAdmin(uid);
  if (!(limits.marketReplay || admin) || !(MARKET_REPLAY_LIVE || admin)) {
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

  let spentFrom: 'daily' | 'credit' | null = null;
  const spend = async () => {
    const result = await consumeDaily('replay', uid, REPLAY_FETCHES_PER_DAY);
    if (!result.ok) {
      throw new BrokerRequestError(
        result.reason === 'unavailable' ? 'Replay is briefly unavailable. Try again in a moment.' : 'That is a lot of replay for one day. It resets at midnight Eastern.',
        result.reason === 'unavailable' ? 503 : 429,
      );
    }
    spentFrom = result.source;
  };

  let got: Map<string, Bar[]>;
  try {
    got = await sessions(wanted, date, spend);
  } catch (err) {
    if (err instanceof BrokerRequestError) return { statusCode: err.statusCode, body: { error: err.message } };
    // The trader paid a unit for a request Databento did not answer. Hand it back.
    if (spentFrom) await refundDaily('replay', uid, spentFrom).catch(() => undefined);
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
  };
  return { statusCode: 200, body: response as unknown as Record<string, unknown> };
}
