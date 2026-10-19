import { describe, expect, it } from 'vitest';
import {
  historyLoadingLine,
  historyLoadingMessage,
  historyLoadingNote,
  historyStillLoading,
  historyWasLoadingRow,
  NEXT_DAY_NOTE,
  noNewTradesLine,
  readHistoryStatus,
} from './brokerHistoryStatus';

/*
 * The one field that tells a new connection's first minutes from a broker with no trades, and the
 * sentences built on it.
 *
 * SnapTrade loads a new account's history in the background and returns an empty activity list
 * until it has finished. A trader who connected Schwab and pressed Sync at six and fourteen minutes
 * got "no activity" both times; three days later the same sync returned 880 activities. These pin
 * how the signal is read — and, more importantly, how its absence is read, because every broker
 * that does not report it has to keep syncing exactly as before — and pin the copy, because the
 * copy is the fix: people read "no activity" as "it does not work", and cancel.
 */

describe('readHistoryStatus', () => {
  it('reads an explicit false as still loading', () => {
    const status = { transactions: { initial_sync_completed: false, first_transaction_date: null } };
    expect(readHistoryStatus(status).loaded).toBe(false);
    expect(historyStillLoading(status)).toBe(true);
  });

  it('reads a finished first load as loaded', () => {
    expect(historyStillLoading({ transactions: { initial_sync_completed: true } })).toBe(false);
  });

  it('reads a missing field as loaded, so brokers that do not report it sync as before', () => {
    // Only `false` is the signal. Anything short of it — no status, no transactions block, a block
    // without the field, junk — must not stop a sync that has worked for a year.
    for (const status of [undefined, null, {}, { transactions: null }, { transactions: {} }, { holdings: { initial_sync_completed: false } }, 'x', 7]) {
      expect(historyStillLoading(status), JSON.stringify(status)).toBe(false);
    }
  });

  it('passes on the first transaction date when SnapTrade sent one', () => {
    const status = { transactions: { initial_sync_completed: true, first_transaction_date: '2025-11-03' } };
    expect(readHistoryStatus(status).firstTransactionDate).toBe('2025-11-03');
    expect(readHistoryStatus({ transactions: { first_transaction_date: null } }).firstTransactionDate).toBeNull();
    expect(readHistoryStatus(undefined).firstTransactionDate).toBeNull();
  });
});

describe('what the trader is told', () => {
  it('names the broker, says the history is on its way to SnapTrade, and says when to come back', () => {
    // Jay's words, in his order: what is happening, then what to do, then what it cost.
    expect(historyLoadingMessage('Charles Schwab')).toBe(
      'Charles Schwab is still sending SnapTrade your trade history, so there is nothing to import yet. Please wait and try again in about 30 minutes. This did not use a sync.',
    );
    expect(historyLoadingMessage('Charles Schwab')).toBe(`${historyLoadingLine('Charles Schwab')} This did not use a sync.`);
  });

  it('promises half an hour, not a few minutes', () => {
    // The connection that prompted this was still empty at fourteen minutes.
    for (const line of [historyLoadingLine('X'), historyLoadingNote('X'), historyLoadingMessage('X')]) {
      expect(line).toContain('30 minutes');
      expect(line).not.toMatch(/few minutes|shortly/);
    }
  });

  it('never says "no activity"', () => {
    for (const line of [historyLoadingLine('X'), historyLoadingNote('X'), historyWasLoadingRow('X'), noNewTradesLine('X')]) {
      expect(line.toLowerCase()).not.toContain('no activity');
    }
  });

  it('falls back when the institution is unknown rather than printing null', () => {
    expect(historyLoadingMessage(null)).toMatch(/^Your broker is still sending/);
    expect(historyWasLoadingRow(undefined)).toMatch(/^Your broker was still sending/);
    expect(historyLoadingNote(undefined)).toMatch(/^Your broker is still sending/);
    expect(noNewTradesLine(null)).toContain('from your broker');
  });

  it('has a past-tense form for the history row that says the same thing', () => {
    expect(historyWasLoadingRow('Robinhood')).toBe(
      'Robinhood was still sending SnapTrade your trade history, so there was nothing to import yet.',
    );
  });

  it('explains an empty narrow window as the normal day-late delivery', () => {
    const line = noNewTradesLine('Charles Schwab');
    expect(line).toContain('No new trades from Charles Schwab since your last sync.');
    expect(line).toContain(NEXT_DAY_NOTE);
    expect(NEXT_DAY_NOTE).toBe('Trades usually arrive the day after they happen.');
  });
});
