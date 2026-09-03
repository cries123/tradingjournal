import { describe, expect, it } from 'vitest';
import { mapSnapTradeActivitiesToTrades } from '../../server/mapSnapTradeActivities';

const stock = (
  id: string, type: 'BUY' | 'SELL', units: number, price: number, fee: number, date: string,
) => ({
  id, type, units, price, fee, trade_date: date,
  symbol: { symbol: 'AAPL' }, account: { id: 'a1', name: 'Brokerage' },
});

const option = (
  id: string, type: 'BUY' | 'SELL', action: string, units: number, price: number, fee: number, date: string,
) => ({
  id, type, units, price, fee, trade_date: date, option_type: action,
  option_symbol: {
    ticker: 'AAPL260116C200', option_type: 'CALL' as const, strike_price: 200,
    expiration_date: '2026-01-16', underlying_symbol: { symbol: 'AAPL' },
  },
  account: { id: 'a1' },
});

const sum = (ns: (number | undefined)[]) => ns.reduce<number>((t, n) => t + (n ?? 0), 0);

/*
 * Fees paid are a fact, not an estimate: however a position is broken up on the way out, the fees
 * the journal attributes to it must add up to the fees the broker charged.
 *
 * They did not. The entry fee was prorated against the lot's REMAINING quantity while that
 * quantity was being decremented, so the last exit out of a position was charged the whole entry
 * commission again. Every account that scales out was affected, and no test data showed it,
 * because test fills close in one piece.
 */
describe('fees across a position closed in pieces', () => {
  it('charges the entry commission once, not once per exit', () => {
    const trades = mapSnapTradeActivitiesToTrades([
      stock('o1', 'BUY', 100, 10, 10, '2026-01-05T15:00:00Z'),
      stock('c1', 'SELL', 50, 12, 5, '2026-01-06T15:00:00Z'),
      stock('c2', 'SELL', 50, 14, 5, '2026-01-07T15:00:00Z'),
    ]);

    expect(trades).toHaveLength(2);
    expect(sum(trades.map((t) => t.fees))).toBeCloseTo(20, 6); // 10 entry + 5 + 5
    expect(sum(trades.map((t) => t.grossPnl))).toBeCloseTo(300, 6);
    expect(sum(trades.map((t) => t.pnl))).toBeCloseTo(280, 6);
  });

  it('holds however many pieces the exit is broken into', () => {
    const trades = mapSnapTradeActivitiesToTrades([
      stock('o1', 'BUY', 100, 10, 12, '2026-01-05T15:00:00Z'),
      stock('c1', 'SELL', 10, 11, 1, '2026-01-06T15:00:00Z'),
      stock('c2', 'SELL', 20, 11, 1, '2026-01-07T15:00:00Z'),
      stock('c3', 'SELL', 30, 11, 1, '2026-01-08T15:00:00Z'),
      stock('c4', 'SELL', 40, 11, 1, '2026-01-09T15:00:00Z'),
    ]);

    expect(trades).toHaveLength(4);
    expect(sum(trades.map((t) => t.fees))).toBeCloseTo(16, 6); // 12 entry + four $1 exits
  });

  it('splits the entry fee in proportion to the size each exit takes', () => {
    const trades = mapSnapTradeActivitiesToTrades([
      stock('o1', 'BUY', 100, 10, 10, '2026-01-05T15:00:00Z'),
      stock('c1', 'SELL', 25, 11, 0, '2026-01-06T15:00:00Z'),
      stock('c2', 'SELL', 75, 11, 0, '2026-01-07T15:00:00Z'),
    ]);

    expect(trades[0].fees).toBeCloseTo(2.5, 6);
    expect(trades[1].fees).toBeCloseTo(7.5, 6);
  });

  it('does the same for options, which have the same matcher and the same bug', () => {
    const trades = mapSnapTradeActivitiesToTrades([
      option('o1', 'BUY', 'BUY_TO_OPEN', 10, 2.0, 6.5, '2026-01-05T15:00:00Z'),
      option('c1', 'SELL', 'SELL_TO_CLOSE', 4, 3.0, 2.6, '2026-01-06T15:00:00Z'),
      option('c2', 'SELL', 'SELL_TO_CLOSE', 6, 3.5, 3.9, '2026-01-07T15:00:00Z'),
    ]);

    expect(trades).toHaveLength(2);
    expect(sum(trades.map((t) => t.fees))).toBeCloseTo(13, 6); // 6.5 + 2.6 + 3.9
    // 4 contracts × $1.00 × 100, then 6 × $1.50 × 100.
    expect(sum(trades.map((t) => t.grossPnl))).toBeCloseTo(1300, 6);
  });

  it('attributes the entry fee once when several entries are closed by one exit', () => {
    const trades = mapSnapTradeActivitiesToTrades([
      stock('o1', 'BUY', 50, 10, 4, '2026-01-05T15:00:00Z'),
      stock('o2', 'BUY', 50, 12, 4, '2026-01-06T15:00:00Z'),
      stock('c1', 'SELL', 100, 15, 6, '2026-01-07T15:00:00Z'),
    ]);

    expect(trades).toHaveLength(2);
    expect(sum(trades.map((t) => t.fees))).toBeCloseTo(14, 6); // 4 + 4 + 6
  });
});
