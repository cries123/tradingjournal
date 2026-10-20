import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { dayIsOpen, filterTradeList, flipsForAll, isFiltering, NO_FILTERS, NO_SETUP, openByDefault, summarizeTradeList } from './tradeList';

let n = 0;
const t = (over: Partial<Trade>): Trade => ({ id: `t${n++}`, date: '2026-09-17', symbol: 'SPY', pnl: 0, ...over }) as Trade;

const call = t({ pnl: 160, optionType: 'call', assetType: 'option', strike: 552, tags: ['ORB'] });
const put = t({ pnl: -204, optionType: 'put', assetType: 'option', strike: 550, tags: ['Fade'], notes: 'Faded the open too early' });
const share = t({ pnl: 180, symbol: 'CVX', assetType: 'stock', date: '2026-09-18' });
const untagged = t({ pnl: -296, optionType: 'call', assetType: 'option', strike: 550, date: '2026-09-24' });
const all = [call, put, share, untagged];
const broke = new Set(['2026-09-17']);

describe('filterTradeList', () => {
  it('shows everything with no filters', () => {
    expect(filterTradeList(all, NO_FILTERS, broke)).toHaveLength(4);
  });

  it('splits winners from losers', () => {
    expect(filterTradeList(all, { ...NO_FILTERS, result: 'won' }, broke)).toEqual([call, share]);
    expect(filterTradeList(all, { ...NO_FILTERS, result: 'lost' }, broke)).toEqual([put, untagged]);
  });

  it('tells calls, puts and shares apart', () => {
    expect(filterTradeList(all, { ...NO_FILTERS, kind: 'calls' }, broke)).toEqual([call, untagged]);
    expect(filterTradeList(all, { ...NO_FILTERS, kind: 'puts' }, broke)).toEqual([put]);
    expect(filterTradeList(all, { ...NO_FILTERS, kind: 'shares' }, broke)).toEqual([share]);
  });

  it('finds trades with a setup, and the ones with none', () => {
    expect(filterTradeList(all, { ...NO_FILTERS, setup: 'ORB' }, broke)).toEqual([call]);
    expect(filterTradeList(all, { ...NO_FILTERS, setup: NO_SETUP }, broke)).toEqual([share, untagged]);
  });

  it('searches contracts, setups and notes', () => {
    expect(filterTradeList(all, { ...NO_FILTERS, query: '552c' }, broke)).toEqual([call]);
    expect(filterTradeList(all, { ...NO_FILTERS, query: 'fade' }, broke)).toEqual([put]);
    expect(filterTradeList(all, { ...NO_FILTERS, query: 'too early' }, broke)).toEqual([put]);
    expect(filterTradeList(all, { ...NO_FILTERS, query: 'cvx' }, broke)).toEqual([share]);
  });

  it('keeps only the days a rule broke, when asked', () => {
    expect(filterTradeList(all, { ...NO_FILTERS, brokeOnly: true }, broke)).toEqual([call, put]);
  });
});

describe('isFiltering', () => {
  it('is off with no filters, and with a search of only spaces', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(isFiltering({ ...NO_FILTERS, query: '   ' })).toBe(false);
  });

  it('is on for a search or any one filter', () => {
    expect(isFiltering({ ...NO_FILTERS, query: 'fade' })).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, result: 'lost' })).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, setup: 'ORB' })).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, setup: NO_SETUP })).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, kind: 'puts' })).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, brokeOnly: true })).toBe(true);
  });
});

describe('which days are open', () => {
  const dates = ['2026-09-24', '2026-09-18', '2026-09-17'];
  const newest = dates[0];
  const none = new Set<string>();
  const open = (filtering: boolean, flipped: ReadonlySet<string>) => dates.filter((d) => dayIsOpen(d, newest, filtering, flipped));

  it('opens only the newest day while browsing', () => {
    expect(open(false, none)).toEqual([newest]);
    expect(openByDefault('2026-09-18', newest, false)).toBe(false);
  });

  it('opens every day a search or filter found', () => {
    expect(open(true, none)).toEqual(dates);
  });

  it('opens a closed day, or closes an open one, that the trader flipped', () => {
    expect(open(false, new Set(['2026-09-17']))).toEqual([newest, '2026-09-17']);
    expect(open(false, new Set([newest]))).toEqual([]);
    expect(open(true, new Set(['2026-09-18']))).toEqual([newest, '2026-09-17']);
  });

  it('has no newest day to open in an empty list', () => {
    expect(openByDefault('2026-09-17', undefined, false)).toBe(false);
  });

  it('expands or collapses every day from either default', () => {
    for (const filtering of [false, true]) {
      expect(open(filtering, flipsForAll(dates, true, newest, filtering)), `expand, filtering ${filtering}`).toEqual(dates);
      expect(open(filtering, flipsForAll(dates, false, newest, filtering)), `collapse, filtering ${filtering}`).toEqual([]);
    }
  });

  it('needs no flips to get back to the default', () => {
    expect(flipsForAll(dates, true, newest, true).size).toBe(0);
    expect([...flipsForAll(dates, false, newest, false)]).toEqual([newest]);
  });
});

describe('summarizeTradeList', () => {
  it('counts what the strip above the list says', () => {
    expect(summarizeTradeList(all, broke)).toEqual({
      count: 4,
      won: 2,
      lost: 2,
      net: 160 - 204 + 180 - 296,
      biggestLoss: -296,
      brokeDays: 1,
      days: 3,
      untagged: 2,
    });
  });

  it('has no biggest loss without a loser', () => {
    expect(summarizeTradeList([call, share], broke).biggestLoss).toBeNull();
  });
});
