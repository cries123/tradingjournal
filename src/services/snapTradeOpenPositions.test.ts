import { describe, expect, it } from 'vitest';
import { mapSnapTradeActivities } from '../../server/mapSnapTradeActivities';

const stock = (
  id: string, type: 'BUY' | 'SELL', units: number, price: number, date: string,
  extra: { symbol?: string; fee?: number } = {},
) => ({
  id, type, units, price, fee: extra.fee ?? 0, trade_date: date,
  symbol: { symbol: extra.symbol ?? 'AAPL' }, account: { id: 'a1' },
});

const option = (
  id: string, type: 'BUY' | 'SELL', action: string, units: number, price: number, date: string,
) => ({
  id, type, units, price, fee: 0, trade_date: date, option_type: action,
  option_symbol: {
    ticker: 'AAPL260116C200', option_type: 'CALL' as const, strike_price: 200,
    expiration_date: '2026-01-16', underlying_symbol: { symbol: 'AAPL' },
  },
  account: { id: 'a1' },
});

/*
 * What a pull leaves open is what the next window has to reach.
 *
 * The sync window used to be anchored on the newest CLOSED trade in the journal, so a position
 * opened before the window and closed inside it arrived as a close with no open: an option close
 * was dropped, a stock sale became a short that was never placed. Reporting the open lots, oldest
 * first, is what lets the server start the next pull no later than the oldest of them.
 */
describe('open positions left by a pull', () => {
  it('reports a lot the feed opened and never closed, oldest first', () => {
    const { trades, openPositions, oldestOpenDate, diagnostics } = mapSnapTradeActivities([
      stock('o1', 'BUY', 100, 10, '2026-03-02T15:00:00Z'),
      stock('o2', 'BUY', 50, 300, '2026-03-04T15:00:00Z', { symbol: 'MSFT' }),
      stock('c2', 'SELL', 50, 310, '2026-03-05T15:00:00Z', { symbol: 'MSFT' }),
      option('o3', 'SELL', 'SELL_TO_OPEN', 2, 1.5, '2026-03-03T15:00:00Z'),
    ]);

    expect(trades.map((t) => t.symbol)).toEqual(['MSFT']);
    expect(openPositions).toEqual([
      { symbol: 'AAPL', openDate: '2026-03-02', units: 100, side: 'long' },
      { symbol: 'AAPL260116C200', openDate: '2026-03-03', units: 2, side: 'short' },
    ]);
    expect(oldestOpenDate).toBe('2026-03-02');
    expect(diagnostics.openPositions).toBe(2);
  });

  it('reports the remainder of a lot that was only partly closed', () => {
    const { openPositions } = mapSnapTradeActivities([
      stock('o1', 'BUY', 100, 10, '2026-03-02T15:00:00Z'),
      stock('c1', 'SELL', 40, 12, '2026-03-03T15:00:00Z'),
    ]);
    expect(openPositions).toEqual([{ symbol: 'AAPL', openDate: '2026-03-02', units: 60, side: 'long' }]);
  });

  it('reports nothing open for a feed of round trips', () => {
    const { openPositions, oldestOpenDate } = mapSnapTradeActivities([
      stock('o1', 'BUY', 100, 10, '2026-03-02T15:00:00Z'),
      stock('c1', 'SELL', 100, 12, '2026-03-03T15:00:00Z'),
    ]);
    expect(openPositions).toEqual([]);
    expect(oldestOpenDate).toBeNull();
  });

  it('dates an open lot on the Eastern trading day, like the trade it will become', () => {
    // 02:00Z on the 3rd is 21:00 Eastern on the 2nd — the day the journal files the fill under.
    const { openPositions } = mapSnapTradeActivities([stock('o1', 'BUY', 100, 10, '2026-03-03T02:00:00Z')]);
    expect(openPositions[0].openDate).toBe('2026-03-02');
  });
});

describe('the direction of a one-day feed', () => {
  // A day of long trades. Read newest-first, forward, every one of them becomes a short.
  const DAY = '2026-03-02T00:00:00Z';
  const OLDEST_FIRST = [
    stock('a', 'BUY', 100, 10, DAY),
    stock('b', 'SELL', 100, 11, DAY),
    stock('c', 'BUY', 100, 12, DAY),
    stock('d', 'SELL', 100, 13, DAY),
  ];
  const NEWEST_FIRST = [...OLDEST_FIRST].reverse();

  it('is read off a multi-day feed and handed back for the next pull', () => {
    const earlier = stock('e', 'BUY', 1, 500, '2026-02-27T00:00:00Z', { symbol: 'MSFT' });
    expect(mapSnapTradeActivities([earlier, ...OLDEST_FIRST]).observedDirection).toBe('oldest-first');
    expect(mapSnapTradeActivities([...NEWEST_FIRST, earlier]).observedDirection).toBe('newest-first');
  });

  it('cannot be read off a one-day feed, and says the order was a guess', () => {
    const { observedDirection, diagnostics } = mapSnapTradeActivities(NEWEST_FIRST);
    expect(observedDirection).toBeNull();
    expect(diagnostics.orientationAssumed).toBe(true);
  });

  it('uses the direction an earlier pull saw, so one day of longs stays long', () => {
    const { trades, diagnostics } = mapSnapTradeActivities(NEWEST_FIRST, { feedDirection: 'newest-first' });
    expect(trades.map((t) => [t.side, t.tradePrice, t.exitPrice])).toEqual([
      ['long', 10, 11],
      ['long', 12, 13],
    ]);
    expect(diagnostics.orientationAssumed).toBe(false);
  });

  it('is not a guess when there is only one fill to order', () => {
    const { diagnostics } = mapSnapTradeActivities([stock('a', 'BUY', 100, 10, DAY)]);
    expect(diagnostics.orientationAssumed).toBe(false);
  });
});

describe('rows the matcher cannot use', () => {
  it('counts a fill of zero units instead of dividing by it', () => {
    const { trades, diagnostics } = mapSnapTradeActivities([
      stock('o1', 'BUY', 100, 10, '2026-03-02T15:00:00Z'),
      stock('z', 'SELL', 0, 12, '2026-03-03T15:00:00Z'),
      stock('c1', 'SELL', 100, 12, '2026-03-04T15:00:00Z'),
    ]);
    expect(diagnostics.ignored.ZERO_UNITS).toBe(1);
    expect(trades).toHaveLength(1);
    expect(Number.isFinite(trades[0].pnl)).toBe(true);
  });

  it('treats a fee that is not a number as no fee, rather than making the P&L NaN', () => {
    const { trades } = mapSnapTradeActivities([
      stock('o1', 'BUY', 100, 10, '2026-03-02T15:00:00Z', { fee: Number.NaN }),
      stock('c1', 'SELL', 100, 12, '2026-03-03T15:00:00Z'),
    ]);
    expect(trades[0].pnl).toBe(200);
  });

  it('dates an unmatched option close on the Eastern trading day', () => {
    const { diagnostics } = mapSnapTradeActivities([
      option('c', 'SELL', 'SELL_TO_CLOSE', 1, 2, '2026-03-03T02:00:00Z'),
    ]);
    expect(diagnostics.unmatchedOptionCloses).toEqual([{ symbol: 'AAPL260116C200', date: '2026-03-02', units: 1 }]);
  });
});
