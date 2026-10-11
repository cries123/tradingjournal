import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { allJournalsView, tradesInView } from './journalScope';
import { limitsFor, TIER_ORDER } from '../config/tiers';

const trade = (id: string, accountId: string | undefined): Trade =>
  ({ id, date: '2026-07-14', symbol: 'SPY', pnl: 10, accountId }) as Trade;

describe('tradesInView', () => {
  const trades = [trade('a', 'schwab'), trade('b', 'robinhood'), trade('c', 'schwab')];

  it('shows the active journal on its own', () => {
    expect(tradesInView(trades, 'schwab', false).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('shows every journal in the all-journals view', () => {
    expect(tradesInView(trades, 'schwab', true).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('files a trade with no journal under the original one, as the rest of the app does', () => {
    // Trades from before journals existed carry no accountId; they belong to "default".
    expect(tradesInView([trade('old', undefined)], 'default', false)).toHaveLength(1);
    expect(tradesInView([trade('old', undefined)], 'schwab', false)).toHaveLength(0);
  });
});

describe('allJournalsView', () => {
  it('is on only when it was turned on, the plan has it, and there is a second journal', () => {
    expect(allJournalsView({ planIncludesIt: true, journalCount: 2, stored: true })).toEqual({ canView: true, viewing: true });
    expect(allJournalsView({ planIncludesIt: true, journalCount: 2, stored: false })).toEqual({ canView: true, viewing: false });
  });

  it('ignores a stale setting after a downgrade', () => {
    // Turned on while on Silver, then dropped to Free: the flag is still saved, the view is not.
    expect(allJournalsView({ planIncludesIt: false, journalCount: 3, stored: true }).viewing).toBe(false);
  });

  it('ignores it with only one journal, where there is nothing to add together', () => {
    expect(allJournalsView({ planIncludesIt: true, journalCount: 1, stored: true })).toEqual({ canView: false, viewing: false });
  });

  it('is on Silver and up, and not on Free', () => {
    expect(TIER_ORDER.map((t) => limitsFor(t).combinedJournals)).toEqual([false, true, true, true]);
    expect(TIER_ORDER.map((t) => limitsFor(t).monthlyReport)).toEqual([false, true, true, true]);
  });
});
