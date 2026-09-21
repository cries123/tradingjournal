import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { JournalAccount } from '../types/settings';
import { countOrphans, describeOrphanSource, findOrphanTrades } from './orphanTrades';

/*
 * Found from a support report: an account showing one journal, whose verified track record
 * insisted 86 hand-entered trades were being excluded. They were real, and they belonged to a
 * journal that had been deleted out from under them — invisible on every screen, untouched by
 * "Clear all", and still counted by everything that walks every trade.
 */

let seq = 0;
const trade = (over: Partial<Trade> = {}): Trade =>
  ({ id: `t${seq++}`, date: '2026-09-01', symbol: 'SPY', pnl: 10, ...over }) as Trade;

const accounts = (...ids: string[]): JournalAccount[] => ids.map((id) => ({ id, name: id }));

describe('findOrphanTrades', () => {
  it('finds nothing when every trade has a live journal', () => {
    const trades = [trade({ accountId: 'schwab' }), trade({ accountId: 'ira' })];
    expect(findOrphanTrades(trades, accounts('schwab', 'ira'))).toEqual([]);
  });

  it('finds trades whose journal was deleted', () => {
    const trades = [trade({ accountId: 'schwab' }), trade({ accountId: 'gone' })];
    const groups = findOrphanTrades(trades, accounts('schwab'));

    expect(groups).toHaveLength(1);
    expect(groups[0].accountId).toBe('gone');
    expect(groups[0].trades).toHaveLength(1);
  });

  it('treats a trade with no accountId as the legacy default journal', () => {
    // Trades predate journals. If the original 'default' journal was replaced rather than
    // renamed, every one of these is stranded — and this is the case that produces the largest
    // orphan groups, because it covers everything somebody logged before they reorganised.
    const groups = findOrphanTrades([trade(), trade()], accounts('schwab'));

    expect(groups).toHaveLength(1);
    expect(groups[0].accountId).toBe('default');
    expect(groups[0].trades).toHaveLength(2);
  });

  it('does not strand legacy trades when the default journal still exists', () => {
    expect(findOrphanTrades([trade()], accounts('default'))).toEqual([]);
  });

  it('separates trades from different dead journals', () => {
    const trades = [
      ...Array.from({ length: 3 }, () => trade({ accountId: 'old-a' })),
      ...Array.from({ length: 5 }, () => trade({ accountId: 'old-b' })),
    ];
    const groups = findOrphanTrades(trades, accounts('schwab'));

    // Biggest first: the one worth acting on should not be below the one that is not.
    expect(groups.map((g) => g.accountId)).toEqual(['old-b', 'old-a']);
    expect(groups.map((g) => g.trades.length)).toEqual([5, 3]);
  });

  it('finds nothing in an empty journal rather than inventing a group', () => {
    expect(findOrphanTrades([], accounts('schwab'))).toEqual([]);
  });
});

describe('countOrphans', () => {
  it('totals every group', () => {
    const trades = [
      ...Array.from({ length: 40 }, () => trade({ accountId: 'old-a' })),
      ...Array.from({ length: 46 }, () => trade({ accountId: 'old-b' })),
    ];
    expect(countOrphans(findOrphanTrades(trades, accounts('schwab')))).toBe(86);
  });

  it('is zero for no groups', () => {
    expect(countOrphans([])).toBe(0);
  });
});

describe('describeOrphanSource', () => {
  it('names the legacy journal as what it is, not as something deleted', () => {
    // Somebody told they have trades from a "deleted journal" they never deleted will go looking
    // for a mistake they did not make.
    expect(describeOrphanSource('default')).toMatch(/before you had separate journals/);
  });

  it('describes any other id as a deleted journal', () => {
    expect(describeOrphanSource('abc123')).toMatch(/deleted/);
  });
});
