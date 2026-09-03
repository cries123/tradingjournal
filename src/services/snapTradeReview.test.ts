import { describe, expect, it } from 'vitest';
import { hasTimeOfDay, mapSnapTradeActivities } from '../../server/mapSnapTradeActivities';
import { describeIgnored, describeSyncGaps } from '../utils/syncGaps';

const fill = (
  id: string, type: 'BUY' | 'SELL', units: number, price: number, date: string,
  extra: { symbol?: string; fee?: number } = {},
) => ({
  id, type, units, price, fee: extra.fee ?? 0, trade_date: date,
  symbol: { symbol: extra.symbol ?? 'AAPL' }, account: { id: 'a1' },
});

const flaglessOption = (id: string, type: 'BUY' | 'SELL', units: number, price: number, date: string) => ({
  id, type, units, price, fee: 0, trade_date: date,
  option_symbol: {
    ticker: 'AAPL260116C200', option_type: 'CALL' as const, strike_price: 200,
    expiration_date: '2026-01-16', underlying_symbol: { symbol: 'AAPL' },
  },
  account: { id: 'a1' },
});

const DAY = '2026-03-02T00:00:00Z'; // a brokerage with no time of day: midnight UTC for everything

/*
 * Buy at 10, sell at 11, buy at 12, sell at 13 — two long round trips, as the trader remembers
 * them. The ids are chosen so that sorting on them would process the fills in the order
 * 0d44, 7e10, c2b7, f9a1: buy@12, sell@13, sell@11, buy@10. That yields a long 12→13 and a
 * SHORT 11→10, a trade this person never placed.
 */
const SAME_DAY_OLDEST_FIRST = [
  fill('f9a1', 'BUY', 100, 10, DAY),
  fill('c2b7', 'SELL', 100, 11, DAY),
  fill('0d44', 'BUY', 100, 12, DAY),
  fill('7e10', 'SELL', 100, 13, DAY),
];

/** An unrelated fill on an earlier day, so the feed's direction can be read off the dates. */
const EARLIER = fill('e', 'BUY', 1, 500, '2026-02-27T00:00:00Z', { symbol: 'MSFT' });

describe('same-day fills from a brokerage with no time of day', () => {
  it('pairs them in feed order when the feed is oldest-first', () => {
    const { trades } = mapSnapTradeActivities([EARLIER, ...SAME_DAY_OLDEST_FIRST]);
    const aapl = trades.filter((t) => t.symbol === 'AAPL');
    expect(aapl.map((t) => [t.side, t.tradePrice, t.exitPrice])).toEqual([
      ['long', 10, 11],
      ['long', 12, 13],
    ]);
  });

  it('pairs them in feed order when the feed is newest-first, by reversing it', () => {
    const newestFirst = [...SAME_DAY_OLDEST_FIRST].reverse();
    const { trades } = mapSnapTradeActivities([...newestFirst, EARLIER]);
    const aapl = trades.filter((t) => t.symbol === 'AAPL');
    expect(aapl.map((t) => [t.side, t.tradePrice, t.exitPrice])).toEqual([
      ['long', 10, 11],
      ['long', 12, 13],
    ]);
  });

  it('never falls back to id order, which is random', () => {
    // Without the earlier day nothing says which way the feed runs; input order is kept.
    const { trades } = mapSnapTradeActivities(SAME_DAY_OLDEST_FIRST);
    expect(trades.every((t) => t.side === 'long')).toBe(true);
  });

  it('says that the pairing on such a day was inferred', () => {
    const { diagnostics } = mapSnapTradeActivities(SAME_DAY_OLDEST_FIRST);
    expect(diagnostics.inferredOrderDays).toEqual([{ symbol: 'AAPL', date: '2026-03-02', fills: 4 }]);
  });

  it('does not call a day inferred when the fills carry real times', () => {
    const { diagnostics } = mapSnapTradeActivities([
      fill('a', 'BUY', 100, 10, '2026-03-02T14:30:00Z'),
      fill('b', 'SELL', 100, 11, '2026-03-02T15:00:00Z'),
    ]);
    expect(diagnostics.inferredOrderDays).toEqual([]);
  });

  it('does not call a day inferred when it only has buys', () => {
    const { diagnostics } = mapSnapTradeActivities([
      fill('a', 'BUY', 100, 10, DAY),
      fill('b', 'BUY', 100, 10.5, DAY),
    ]);
    expect(diagnostics.inferredOrderDays).toEqual([]);
  });
});

describe('the calendar day of a trade', () => {
  it('is the Eastern day, so it agrees with the Eastern time shown beside it', () => {
    const { trades } = mapSnapTradeActivities([
      fill('b', 'BUY', 100, 10, '2026-06-15T14:30:00Z'),
      fill('s', 'SELL', 100, 11, '2026-06-16T00:30:00Z'), // 20:30 on June 15, Eastern
    ]);
    expect(trades[0].date).toBe('2026-06-15');
    expect(trades[0].exitTime).toBe('20:30');
  });

  it('is left alone for a brokerage that sends no time of day', () => {
    // Midnight UTC is 8pm Eastern the evening before. Converting it would move the whole
    // account back a day.
    const { trades } = mapSnapTradeActivities([
      fill('b', 'BUY', 100, 10, '2026-06-15T00:00:00Z'),
      fill('s', 'SELL', 100, 11, '2026-06-16T00:00:00Z'),
    ]);
    expect(trades[0].date).toBe('2026-06-16');
    expect(trades[0].exitTime).toBeUndefined();
  });

  it('is left alone for a bare date', () => {
    const { trades } = mapSnapTradeActivities([
      fill('b', 'BUY', 100, 10, '2026-06-15'),
      fill('s', 'SELL', 100, 11, '2026-06-16'),
    ]);
    expect(trades[0].date).toBe('2026-06-16');
  });

  it('knows a real time from the sentinel', () => {
    expect(hasTimeOfDay('2026-06-16T00:30:00Z')).toBe(true);
    expect(hasTimeOfDay('2026-06-16T00:00:00Z')).toBe(false);
    expect(hasTimeOfDay('2026-06-16')).toBe(false);
    expect(hasTimeOfDay('not a date')).toBe(false);
  });
});

describe('option fills without an open/close flag', () => {
  it('are matched by inventory instead of being dropped', () => {
    const { trades } = mapSnapTradeActivities([
      flaglessOption('o', 'BUY', 1, 2.0, '2026-01-05T15:00:00Z'),
      flaglessOption('c', 'SELL', 1, 3.0, '2026-01-06T15:00:00Z'),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBeCloseTo(100, 6); // one contract, $1.00 × 100
    expect(trades[0].assetType).toBe('option');
  });

  it('handle a premium seller the same way', () => {
    const { trades, diagnostics } = mapSnapTradeActivities([
      flaglessOption('o', 'SELL', 2, 3.0, '2026-01-05T15:00:00Z'),
      flaglessOption('c', 'BUY', 2, 1.0, '2026-01-06T15:00:00Z'),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('short');
    expect(trades[0].pnl).toBeCloseTo(400, 6);
    // And say the short was assumed, naming the contract rather than the underlying.
    expect(diagnostics.assumedShorts[0].symbol).toBe('AAPL260116C200');
  });
});

describe('rows the sync reads past', () => {
  it('are counted by type instead of vanishing', () => {
    const { diagnostics } = mapSnapTradeActivities([
      { id: 'd', type: 'DIVIDEND', units: 0, price: 0, fee: 0, trade_date: '2026-01-05T15:00:00Z', symbol: { symbol: 'AAPL' }, account: { id: 'a1' } },
      { id: 'd2', type: 'DIVIDEND', units: 0, price: 0, fee: 0, trade_date: '2026-02-05T15:00:00Z', symbol: { symbol: 'AAPL' }, account: { id: 'a1' } },
      { id: 't', type: 'TRANSFER', units: 100, price: 0, fee: 0, trade_date: '2026-01-05T15:00:00Z', symbol: { symbol: 'AAPL' }, account: { id: 'a1' } },
    ]);
    expect(diagnostics.ignored).toEqual({ DIVIDEND: 2, TRANSFER: 1 });
    expect(describeIgnored(diagnostics.ignored)).toBe('2 dividends, 1 transfer');
  });

  it('explain what a transfer or a split does to the matching', () => {
    const [note] = describeSyncGaps({ ignored: { TRANSFER: 1, SPLIT: 1 } });
    expect(note).toContain('1 transfer');
    expect(note).toContain('selling them will read as a short');
    expect(note).toContain('across the split date');
  });
});

describe('a fee reported as a negative number', () => {
  it('is a cost, and is counted so the assumption is visible', () => {
    const { trades, diagnostics } = mapSnapTradeActivities([
      fill('b', 'BUY', 100, 10, '2026-01-05T15:00:00Z', { fee: -5 }),
      fill('s', 'SELL', 100, 11, '2026-01-06T15:00:00Z', { fee: -5 }),
    ]);
    // The old reading: gross 100, fees -10, net 110 — every fee added to P&L.
    expect(trades[0].fees).toBeCloseTo(10, 6);
    expect(trades[0].pnl).toBeCloseTo(90, 6);
    expect(diagnostics.negativeFees).toBe(2);
    expect(describeSyncGaps({ negativeFees: 2 })[0]).toContain('2 fills reported the fee as a negative number');
  });
});
