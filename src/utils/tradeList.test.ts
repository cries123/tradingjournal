import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { filterTradeList, NO_FILTERS, NO_SETUP, summarizeTradeList } from './tradeList';

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
