import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { resolveAccess } from './entitlements';
import { getAdminFirestore } from './firebaseAdmin';
import {
  readReplaySpendState,
  replayPeriods,
  reserveReplaySpend,
  settleReplaySpend,
  type ReplayPull,
  type ReplayReservation,
} from './replayLedger';
import { logServerError } from './errorReports';
import { tierHas } from '../src/config/tiers';
import { allowanceShares, REPLAY_DAY_USED, REPLAY_MONTH_USED, type ReplaySpendState } from '../src/utils/replayAllowance';
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
 * cost is asked of Databento itself (metadata.get_cost) and counted against the member's allowance
 * (TierLimits.replayUsdPerMonth, split evenly across the month's days) and the admin panel's totals
 * — see replayLedger.ts and utils/replayAllowance.ts.
 *
 * Real prices, from Jay's bill for 20 October 2026: OPRA ran about $0.26 a MB, so one contract's full
 * session (405 bars, ~23 KB) is about half a cent and opening a day with a dozen contracts about 7¢.
 * SPY's bars from EQUS.MINI cost next to nothing.
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
/** The most one-minute bars a session holds: 9:30 to 16:15 is 405 minutes (sessionWindow). */
const SESSION_BARS = 405;
/**
 * Dollars per byte when the cost endpoint does not answer: the rate it last answered with in this
 * container, else this one, a little above what Databento really charged.
 *
 * $0.30 a MB, from Jay's Databento bill for 20 October 2026: $3.51 for 13.7 MB, all but a cent of it
 * OPRA, which is $0.256 a MB. Databento publishes no per-GB rate for options, and this stand-in used
 * to be $1 a GB — about 250 times too low, so a pull priced while the cost endpoint was down would
 * have cost a member almost nothing against their allowance while costing the business the real
 * price. It errs high on purpose: a guessed price should land on the allowance, not on the bill.
 * Equities (EQUS.MINI) are far cheaper, so pricing them at this rate only ever over-counts.
 */
const FALLBACK_USD_PER_BYTE = 0.3 / 1e6;
const observedRate = new Map<string, number>();
/** What one symbol's session can cost at most: what a pull reserves against the allowance per symbol. */
export const MAX_USD_PER_SYMBOL = SESSION_BARS * BYTES_PER_BAR * FALLBACK_USD_PER_BYTE;

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
  /** Today's and this month's replay data used, each 0 to 1 of its allowance. Null for the site admin. */
  allowance: { today: number; month: number } | null;
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
 * `allowed` is called once, with how many symbols are about to be bought, before the first Databento
 * request — so a fully cached replay never touches the allowance and is never refused by it.
 */
async function sessions(
  wanted: { dataset: string; symbol: string }[],
  date: string,
  allowed: (symbols: number) => Promise<void>,
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

  await allowed(missing.length);
  const fetched = await Promise.all(missing.map(([, w]) => fetchSession(w.dataset, w.symbol, date)));
  /*
   * From here the data is bought, so nothing may fail the request: a cache write that throws is
   * logged and the bars are still returned and still counted. It used to reject the whole request,
   * which threw away bars Databento had already billed for, recorded nothing against anybody, and
   * left the next request to buy the same day again.
   */
  const [prices] = await Promise.all([
    Promise.all(missing.map(([, w], i) => priceSession(w.dataset, w.symbol, date, fetched[i].length))),
    ...missing.map(([id, w], i) => {
      out.set(id, fetched[i]);
      return db
        .collection(CACHE)
        .doc(id)
        .set(toCached(w.dataset, w.symbol, date, fetched[i]))
        .catch(async (err: unknown) => {
          await logServerError('market-replay-cache', err, { path: `${CACHE}/${id}` });
        });
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

/** The allowance line, from the settled spend when there is one, else read; null if unreadable. */
async function allowanceFor(uid: string, spend: ReplaySpendState | null, monthlyUsd: number, day: string, now: Date) {
  try {
    return allowanceShares(spend ?? (await readReplaySpendState(uid, now)), monthlyUsd, day);
  } catch {
    return null;
  }
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
   * allowance, though his pulls are counted like anybody's and show on his profile and the Costs tab.
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

  /*
   * Room is reserved only when something has to be bought, at the most those symbols could cost, and
   * settled at Databento's own price once the bars are in hand. A ledger that cannot be read refuses
   * new data rather than guess at somebody's month; a fully cached day never asks it.
   */
  const allowance = limits.replayUsdPerMonth;
  const { day } = replayPeriods(now);
  let reservation: ReplayReservation | null = null;
  const allowed = async (symbols: number) => {
    let result;
    try {
      result = await reserveReplaySpend(uid, { estimateUsd: symbols * MAX_USD_PER_SYMBOL, monthlyUsd: allowance, enforce: !admin }, now);
    } catch (err) {
      await logServerError('market-replay-ledger', err, { uid });
      throw new BrokerRequestError('Replay is briefly unavailable. Try again in a moment.', 503);
    }
    if (!result.ok) throw new BrokerRequestError(result.reason === 'day' ? REPLAY_DAY_USED : REPLAY_MONTH_USED, 429);
    reservation = result.reservation;
  };

  let got: Map<string, Bar[]>;
  let spend: ReplaySpendState | null = null;
  try {
    const result = await sessions(wanted, date, allowed);
    got = result.bars;
    const held = reservation as ReplayReservation | null;
    if (held) spend = await settleReplaySpend(uid, held.id, result.bought, now);
  } catch (err) {
    if (err instanceof BrokerRequestError) return { statusCode: err.statusCode, body: { error: err.message } };
    // Databento did not answer, so nothing was bought: hand the reservation back.
    const held = reservation as ReplayReservation | null;
    if (held) await settleReplaySpend(uid, held.id, null, now);
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
    // Null for the site admin, who has no allowance to show, and when the ledger could not be read.
    allowance: admin ? null : await allowanceFor(uid, spend, allowance, day, now),
  };
  return { statusCode: 200, body: response as unknown as Record<string, unknown> };
}
