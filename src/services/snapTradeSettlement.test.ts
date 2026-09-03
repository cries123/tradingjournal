import { describe, expect, it } from 'vitest';
import { mapSnapTradeActivities } from '../../server/mapSnapTradeActivities';
import { describeSyncGaps } from '../utils/syncGaps';

const option = (
  id: string, type: string, action: string | undefined, units: number,
  price: number | undefined, date: string, ticker = 'AAPL260116C200',
) => ({
  id, type, units, price, fee: 0, trade_date: date, option_type: action,
  option_symbol: {
    ticker, option_type: 'CALL' as const, strike_price: 200,
    expiration_date: '2026-01-16', underlying_symbol: { symbol: 'AAPL' },
  },
  account: { id: 'a1' },
});

const stock = (id: string, type: 'BUY' | 'SELL', units: number, price: number, date: string) => ({
  id, type, units, price, fee: 0, trade_date: date,
  symbol: { symbol: 'AAPL' }, account: { id: 'a1' },
});

describe('options that end without a trade', () => {
  /*
   * Only BUY and SELL rows were read, so an expiry produced nothing: the premium went unrecorded
   * and the open lot stayed in the matcher, ready to mispair against a later fill. Expiries are
   * routine and absent from test data, which is a large part of why a real account and a sandbox
   * one disagreed.
   */
  it('records a long call that expired worthless as the loss of the premium', () => {
    const { trades } = mapSnapTradeActivities([
      option('o1', 'BUY', 'BUY_TO_OPEN', 5, 2.0, '2026-01-05T15:00:00Z'),
      option('x1', 'OPTIONEXPIRATION', undefined, 5, undefined, '2026-01-16T21:00:00Z'),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBeCloseTo(-1000, 6); // 5 × $2.00 × 100
    expect(trades[0].side).toBe('long');
    expect(trades[0].exitPrice).toBe(0);
  });

  /*
   * The direction has to come from the lot. Reading it off the closing fill worked only because a
   * long is normally closed by a sell — an expiry has no side, and treating it as a sell booked
   * the best outcome a short option has as a loss of the same size.
   */
  it('records a short put that expired worthless as keeping the premium', () => {
    const { trades } = mapSnapTradeActivities([
      option('o1', 'SELL', 'SELL_TO_OPEN', 2, 3.0, '2026-01-05T15:00:00Z'),
      option('x1', 'OPTIONEXPIRATION', undefined, 2, undefined, '2026-01-16T21:00:00Z'),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBeCloseTo(600, 6); // kept, not lost
    expect(trades[0].side).toBe('short');
  });

  it('closes the position the matcher is holding, not the size the expiry row claims', () => {
    // Brokerages report expiry quantities inconsistently — sometimes zero, sometimes absent.
    for (const units of [0, 5]) {
      const { trades } = mapSnapTradeActivities([
        option('o1', 'BUY', 'BUY_TO_OPEN', 5, 2.0, '2026-01-05T15:00:00Z'),
        option('x1', 'OPTIONEXPIRATION', undefined, units, undefined, '2026-01-16T21:00:00Z'),
      ]);
      expect(trades, `units=${units}`).toHaveLength(1);
      expect(trades[0].quantity, `units=${units}`).toBe(5);
      expect(trades[0].pnl, `units=${units}`).toBeCloseTo(-1000, 6);
    }
  });

  it('handles assignment and exercise the same way', () => {
    for (const type of ['OPTIONASSIGNMENT', 'OPTION_EXERCISE']) {
      const { trades } = mapSnapTradeActivities([
        option('o1', 'SELL', 'SELL_TO_OPEN', 1, 4.0, '2026-01-05T15:00:00Z'),
        option('x1', type, undefined, 1, undefined, '2026-01-16T21:00:00Z'),
      ]);
      expect(trades, type).toHaveLength(1);
      // The option leg keeps its premium; the stock the assignment creates arrives as its own
      // BUY/SELL activity and is matched separately.
      expect(trades[0].pnl, type).toBeCloseTo(400, 6);
    }
  });

  it('leaves no lot behind for a later fill to mispair against', () => {
    const { trades } = mapSnapTradeActivities([
      option('o1', 'BUY', 'BUY_TO_OPEN', 5, 2.0, '2026-01-05T15:00:00Z'),
      option('x1', 'OPTIONEXPIRATION', undefined, 5, undefined, '2026-01-16T21:00:00Z'),
      option('o2', 'BUY', 'BUY_TO_OPEN', 5, 1.0, '2026-02-02T15:00:00Z'),
      option('c2', 'SELL', 'SELL_TO_CLOSE', 5, 1.5, '2026-02-03T15:00:00Z'),
    ]);

    expect(trades).toHaveLength(2);
    // The February round trip must pair with the February entry, not the expired January one.
    expect(trades[1].tradePrice).toBe(1.0);
    expect(trades[1].pnl).toBeCloseTo(250, 6);
  });
});

describe('what the sync could not account for', () => {
  it('reports an option close whose opening trade predates the history', () => {
    const { trades, diagnostics } = mapSnapTradeActivities([
      option('c1', 'SELL', 'SELL_TO_CLOSE', 5, 4.2, '2026-02-01T15:00:00Z'),
    ]);

    expect(trades).toHaveLength(0); // still not invented — there is no entry price to invent
    expect(diagnostics.unmatchedOptionCloses).toEqual([
      { symbol: 'AAPL260116C200', date: '2026-02-01', units: 5 },
    ]);
  });

  /*
   * Reached only by a settlement, and only when there is nothing to settle: an option that expired
   * out of a position opened before the history begins. The first mutation run passed without this
   * — the ordinary unmatched close is caught further down, so this branch had no test of its own.
   */
  it('reports an expiry for a position it never saw opened', () => {
    const { trades, diagnostics } = mapSnapTradeActivities([
      option('x1', 'OPTIONEXPIRATION', undefined, 3, undefined, '2026-01-16T21:00:00Z'),
    ]);

    expect(trades).toHaveLength(0);
    expect(diagnostics.unmatchedOptionCloses).toHaveLength(1);
    expect(diagnostics.unmatchedOptionCloses[0].date).toBe('2026-01-16');
  });

  /*
   * A short sale IS a sell with no prior buy, so this cannot be distinguished from selling shares
   * bought before the history begins. It stays recorded — dropping every short would be worse —
   * and gets reported so a trader who sees a short they never placed knows where it came from.
   */
  it('reports a position it had to assume was a short', () => {
    const { trades, diagnostics } = mapSnapTradeActivities([
      stock('s1', 'SELL', 100, 150, '2026-02-01T15:00:00Z'),
      stock('b1', 'BUY', 100, 170, '2026-02-10T15:00:00Z'),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('short');
    expect(diagnostics.assumedShorts).toEqual([
      { symbol: 'AAPL', date: '2026-02-01', units: 100 },
    ]);
  });

  it('reports nothing when every fill pairs up', () => {
    const { diagnostics } = mapSnapTradeActivities([
      stock('b1', 'BUY', 100, 150, '2026-02-01T15:00:00Z'),
      stock('s1', 'SELL', 100, 170, '2026-02-10T15:00:00Z'),
      option('o1', 'BUY', 'BUY_TO_OPEN', 5, 2.0, '2026-01-05T15:00:00Z'),
      option('c1', 'SELL', 'SELL_TO_CLOSE', 5, 3.0, '2026-01-06T15:00:00Z'),
    ]);

    expect(diagnostics.unmatchedOptionCloses).toEqual([]);
    expect(diagnostics.assumedShorts).toEqual([]);
    expect(describeSyncGaps(0, 0)).toEqual([]);
  });

  it('says something a trader can act on', () => {
    const [closes] = describeSyncGaps(3, 0);
    expect(closes).toContain('3 closing fills');
    expect(closes).toContain('older than the history your broker shares');

    const [shorts] = describeSyncGaps(0, 1);
    expect(shorts).toContain('1 position was');
    expect(shorts).toContain('entry price on those trades is wrong');
  });
});
