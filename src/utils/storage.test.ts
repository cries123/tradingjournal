import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStorageFailureLatchForTests,
  clearLegacyTradesStorage,
  clearTrades,
  loadTrades,
  saveTrades,
} from './storage';
import type { Trade } from '../types';

/*
 * The local trade cache, which had no tests and one line that could take the whole app down.
 *
 * Every caller of saveTrades is inside a React state updater, so anything it throws comes out
 * during a state update and lands on the crash screen. Two environments make setItem throw and
 * both are real: the ~5MB quota, and Safari with site data blocked or a private window, where every
 * write throws. Most of this file is about that, and about the per-user scoping that stops one
 * trader's cache being read as another's.
 */

const reportErrorSilently = vi.fn();
vi.mock('../services/errorReporting', () => ({
  reportErrorSilently: (...args: unknown[]) => reportErrorSilently(...args),
}));

const store = new Map<string, string>();
let failWrites = false;

beforeEach(() => {
  store.clear();
  failWrites = false;
  reportErrorSilently.mockClear();
  __resetStorageFailureLatchForTests();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new DOMException('quota', 'QuotaExceededError');
      store.set(k, v);
    },
    removeItem: (k: string) => {
      if (failWrites) throw new DOMException('quota', 'QuotaExceededError');
      store.delete(k);
    },
  });
});

const trade = (over: Partial<Trade> = {}): Trade =>
  ({ id: 'a1', date: '2026-09-29', symbol: 'SPY', pnl: 50, ...over }) as Trade;

describe('saveTrades', () => {
  it('scopes the cache to the signed-in user', () => {
    // Two traders on one browser must never read each other's journal out of this.
    saveTrades([trade()], 'uid-1');
    expect(store.has('trading-journal-trades:uid-1')).toBe(true);
    expect(loadTrades('uid-2')).toEqual([]);
  });

  it('keeps signed-out trades in their own bucket', () => {
    saveTrades([trade()], null);
    expect(store.has('trading-journal-trades:local')).toBe(true);
  });

  it('does not throw when the browser refuses to store anything', () => {
    /*
     * The bug. In Safari private browsing every setItem throws, and this call sits in the middle of
     * a setTrades updater — so logging a trade threw during a state update, past no catch at all,
     * and the trader got the crash screen instead of their trade.
     */
    failWrites = true;
    expect(() => saveTrades([trade()], null)).not.toThrow();
  });

  it('reports a refused write, so it is not invisible', () => {
    failWrites = true;
    saveTrades([trade()], null);

    expect(reportErrorSilently).toHaveBeenCalledTimes(1);
    expect(reportErrorSilently.mock.calls[0][2]).toBe('local-trades-write');
  });

  it('reports it once however many writes fail', () => {
    // Ten trades in a blocked browser is ten identical failures; ten identical reports would be
    // the only thing in the admin error panel.
    failWrites = true;
    for (let i = 0; i < 10; i++) saveTrades([trade({ id: `a${i}` })], null);

    expect(reportErrorSilently).toHaveBeenCalledTimes(1);
  });
});

describe('clearTrades', () => {
  it('removes only the bucket it was asked for', () => {
    saveTrades([trade()], 'uid-1');
    saveTrades([trade()], null);

    clearTrades('uid-1');

    expect(loadTrades('uid-1')).toEqual([]);
    expect(loadTrades(null)).toHaveLength(1);
  });

  it('does not throw in a browser that refuses removals either', () => {
    failWrites = true;
    expect(() => clearTrades(null)).not.toThrow();
    expect(() => clearLegacyTradesStorage()).not.toThrow();
  });
});

describe('loadTrades', () => {
  it('returns an empty journal rather than throwing on a corrupt cache', () => {
    store.set('trading-journal-trades:local', '{not json');
    expect(loadTrades(null)).toEqual([]);
  });

  it('migrates the old unscoped key into the signed-out bucket', () => {
    store.set('trading-journal-trades', JSON.stringify([trade()]));

    expect(loadTrades(null)).toHaveLength(1);
    expect(store.has('trading-journal-trades')).toBe(false);
  });

  it('never migrates the old key into a signed-in account', () => {
    // That key predates per-user scoping, so whatever is in it belongs to whoever used this browser
    // before — handing it to a new sign-in is how one trader inherits another's trades.
    store.set('trading-journal-trades', JSON.stringify([trade()]));

    expect(loadTrades('uid-1')).toEqual([]);
    expect(store.has('trading-journal-trades')).toBe(true);
  });

  it('throws away a cache that is only the sample dataset', () => {
    // The demo trades have ids 1-35. Treating them as real would show a new signup somebody else's
    // fictional P&L as their own.
    const sample = Array.from({ length: 35 }, (_, i) => trade({ id: String(i + 1) }));
    store.set('trading-journal-trades:local', JSON.stringify(sample));

    expect(loadTrades(null)).toEqual([]);
  });

  it('keeps a journal that merely contains a trade with a low id', () => {
    // The sample check must be "all of them", not "any of them": a real trade can have id "7".
    const mixed = [trade({ id: '7' }), trade({ id: 'snaptrade_schwab_1_0' })];
    store.set('trading-journal-trades:local', JSON.stringify(mixed));

    expect(loadTrades(null)).toHaveLength(2);
  });
});
