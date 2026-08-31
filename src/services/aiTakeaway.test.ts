import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { hashTrades } from './aiTakeaway';

const trade = (id: string, pnl: number, over: Partial<Trade> = {}): Trade =>
  ({ id, date: '2026-07-14', symbol: 'SPY', pnl, ...over }) as Trade;

/**
 * The hash is the server's cache key, so these are the properties that decide whether a trader
 * sees a stale takeaway or pays for a regeneration they didn't need.
 */
describe('hashTrades', () => {
  it('is stable for the same trades', () => {
    const trades = [trade('a', 100), trade('b', -50)];
    expect(hashTrades(trades)).toBe(hashTrades([...trades]));
  });

  it('ignores the order trades arrive in', () => {
    // Firestore ordering is not guaranteed to be stable across syncs; if it changed the key, every
    // reload would look like a new trade set and burn a generation.
    const a = [trade('a', 100), trade('b', -50), trade('c', 25)];
    expect(hashTrades(a)).toBe(hashTrades([a[2], a[0], a[1]]));
  });

  it('changes when a trade is edited', () => {
    expect(hashTrades([trade('a', 100)])).not.toBe(hashTrades([trade('a', 120)]));
  });

  it('changes when a trade is added or removed', () => {
    const base = [trade('a', 100)];
    expect(hashTrades(base)).not.toBe(hashTrades([...base, trade('b', 10)]));
    expect(hashTrades([])).not.toBe(hashTrades(base));
  });

  it('changes when a sync fills in fees, because the net P&L the model saw changed', () => {
    const before = trade('a', 100);
    const after = trade('a', 100, { grossPnl: 100, fees: 8 });
    expect(hashTrades([before])).not.toBe(hashTrades([after]));
  });

  it('changes when a setup or side is corrected', () => {
    // Both feed the facts the model reasons from, so a takeaway written before the correction is
    // about a different period than the one on screen.
    expect(hashTrades([trade('a', 100)])).not.toBe(hashTrades([trade('a', 100, { setup: 'ORB' })]));
    expect(hashTrades([trade('a', 100)])).not.toBe(hashTrades([trade('a', 100, { side: 'short' })]));
  });

  it('does not collide between two different trades with the same P&L', () => {
    expect(hashTrades([trade('a', 100)])).not.toBe(hashTrades([trade('b', 100)]));
  });

  it('carries the trade count, so a length change can never collide', () => {
    expect(hashTrades([trade('a', 100), trade('b', 5)]).endsWith('-2')).toBe(true);
  });
});
