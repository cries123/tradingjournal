import type { Trade } from '../types';
import type { Bar, Right } from './marketReplay';

/**
 * What the browser asks /api/trade-paths for, and how the answer's bars travel.
 *
 * One item per contract-day (or stock-day), not per trade: a trader who took the same strike six
 * times that morning needs its bars once. Shared by the server and the client so the two cannot
 * disagree about the shape.
 */

export type PathItem =
  | { kind: 'option'; date: string; underlying: string; expiration: string; right: Right; strike: number; fills: number[] }
  | { kind: 'stock'; date: string; symbol: string };

/** High, low and close, with each bar's time as whole minutes after the first's. */
export interface CompactBars {
  t0: number;
  m: number[];
  h: number[];
  l: number[];
  c: number[];
}

export function expand(c: CompactBars): Bar[] {
  return c.m.map((minutes, i) => ({ time: c.t0 + minutes * 60, open: c.c[i], high: c.h[i], low: c.l[i], close: c.c[i], volume: 0 }));
}

/** The item a trade needs, or null for one these measurements cannot place (no prices, no contract, carried overnight). */
export function pathItemFor(t: Trade): PathItem | null {
  if (t.tradePrice == null || t.exitPrice == null) return null;
  if (t.openDate && t.openDate !== t.date) return null;
  const symbol = (t.symbol ?? '').trim().toUpperCase();
  if (!symbol) return null;
  const isOption = t.assetType === 'option' || t.optionType != null;
  if (!isOption) return /^[A-Z.]{1,6}$/.test(symbol) ? { kind: 'stock', date: t.date, symbol } : null;
  if (t.strike == null || !t.expiration || (t.optionType !== 'call' && t.optionType !== 'put')) return null;
  return {
    kind: 'option',
    date: t.date,
    underlying: symbol,
    expiration: t.expiration.slice(0, 10),
    right: t.optionType === 'call' ? 'C' : 'P',
    strike: Number(t.strike),
    fills: [t.tradePrice, t.exitPrice],
  };
}

/** The key two trades share when they need the same bars. Fills are left out: the contract is the same. */
export function pathKey(item: PathItem): string {
  return item.kind === 'stock' ? `${item.date}|${item.symbol}` : `${item.date}|${item.underlying}|${item.expiration}|${item.right}|${item.strike}`;
}
