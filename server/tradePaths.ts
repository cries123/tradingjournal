import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { resolveAccess } from './entitlements';
import { isSiteAdmin, readCachedBars } from './marketReplay';
import { logServerError } from './errorReports';
import { tierHas } from '../src/config/tiers';
import { isTradingDay, optionRoots, osiSymbol, pickContract, type Bar } from '../src/utils/marketReplay';
import type { CompactBars, PathItem } from '../src/utils/tradePathBars';

/**
 * The minute bars behind a list of trades, from market replay's cache only.
 *
 * What lets the journal measure a trade's best and worst price, what it did after it was sold, and a
 * stop or a target on real prices — without buying any data. Only a day somebody has already opened
 * in market replay is in the cache; for any other day the answer is "not stored", and the screen
 * says to open that day. Diamond, like replay itself, because the bars are replay's.
 */

/** Contract-days one request may ask about: a busy month of distinct contracts, well inside Netlify's 6 MB body. */
const MAX_ITEMS = 150;

function readItems(input: unknown): PathItem[] | null {
  if (!Array.isArray(input) || input.length > MAX_ITEMS) return null;
  const out: PathItem[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const date = typeof raw?.date === 'string' ? raw.date : '';
    if (!isTradingDay(date)) return null;
    if (raw?.kind === 'stock') {
      const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
      if (!/^[A-Z.]{1,6}$/.test(symbol)) return null;
      out.push({ kind: 'stock', date, symbol });
      continue;
    }
    const underlying = typeof raw?.underlying === 'string' ? raw.underlying.trim().toUpperCase() : '';
    const expiration = typeof raw?.expiration === 'string' ? raw.expiration.slice(0, 10) : '';
    const right = raw?.right === 'C' || raw?.right === 'P' ? raw.right : null;
    const strike = typeof raw?.strike === 'number' ? raw.strike : NaN;
    const fills = Array.isArray(raw?.fills) ? (raw.fills as unknown[]).filter((f): f is number => typeof f === 'number' && Number.isFinite(f)).slice(0, 20) : [];
    if (!/^[A-Z]{1,6}$/.test(underlying) || !right || !osiSymbol(underlying, expiration, right, strike)) return null;
    out.push({ kind: 'option', date, underlying, expiration, right, strike, fills });
  }
  return out;
}

/** High, low and close only — what the measurements read — as minutes from the first bar. */
export function compact(bars: Bar[]): CompactBars | null {
  if (bars.length === 0) return null;
  const t0 = bars[0].time;
  return {
    t0,
    m: bars.map((b) => Math.round((b.time - t0) / 60)),
    h: bars.map((b) => b.high),
    l: bars.map((b) => b.low),
    c: bars.map((b) => b.close),
  };
}

export async function handleTradePathsRequest(
  headers: IncomingHttpHeaders,
  body: { items?: unknown },
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  let uid: string;
  try {
    uid = await assertCallerUid(headers);
  } catch (err) {
    const status = err instanceof BrokerRequestError ? err.statusCode : 401;
    return { statusCode: status, body: { error: err instanceof Error ? err.message : 'Sign in required' } };
  }

  const { tier } = await resolveAccess(uid);
  if (!tierHas(tier, 'marketReplay') && !(await isSiteAdmin(uid))) {
    return { statusCode: 403, body: { error: 'Trade measurements come with market replay, which is part of Diamond.' } };
  }

  const items = readItems(body.items ?? []);
  if (!items) return { statusCode: 400, body: { error: `Up to ${MAX_ITEMS} trading days, each a stock symbol or an option contract.` } };

  try {
    const byDate = new Map<string, { options: string[]; equities: string[] }>();
    const candidates = items.map((item) => {
      const want = byDate.get(item.date) ?? { options: [], equities: [] };
      byDate.set(item.date, want);
      if (item.kind === 'stock') {
        want.equities.push(item.symbol);
        return [item.symbol];
      }
      const roots = optionRoots(item.underlying)
        .map((root) => osiSymbol(root, item.expiration, item.right, item.strike))
        .filter((s): s is string => s !== null);
      want.options.push(...roots);
      return roots;
    });

    const cached = new Map<string, { options: Map<string, Bar[]>; equities: Map<string, Bar[]> }>();
    await Promise.all(
      [...byDate.entries()].map(async ([date, want]) => {
        const [options, equities] = await Promise.all([
          want.options.length ? readCachedBars('options', want.options, date) : new Map<string, Bar[]>(),
          want.equities.length ? readCachedBars('equities', want.equities, date) : new Map<string, Bar[]>(),
        ]);
        cached.set(date, { options, equities });
      }),
    );

    const answers = items.map((item, index) => {
      const day = cached.get(item.date)!;
      if (item.kind === 'stock') {
        const bars = day.equities.get(item.symbol);
        return { index, osi: null, bars: bars ? compact(bars) : null, stored: Boolean(bars) };
      }
      const found = candidates[index].filter((osi) => day.options.has(osi)).map((osi) => ({ osi, bars: day.options.get(osi)! }));
      if (found.length === 0) return { index, osi: null, bars: null, stored: false };
      const osi = pickContract(found, item.fills);
      const bars = osi ? found.find((f) => f.osi === osi)!.bars : [];
      return { index, osi, bars: compact(bars), stored: true };
    });
    return { statusCode: 200, body: { items: answers } };
  } catch (err) {
    await logServerError('trade-paths', err, { uid });
    return { statusCode: 503, body: { error: 'Could not read the stored market data. Try again in a moment.' } };
  }
}
