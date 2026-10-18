import { describe, expect, it } from 'vitest';
import {
  historyLoadingMessage,
  historyLoadingNote,
  historyStillLoading,
  readHistoryStatus,
} from './brokerHistoryStatus';

/*
 * The one field that tells a new connection's first minutes from a broker with no trades.
 *
 * SnapTrade loads a new account's history in the background and returns an empty activity list
 * until it has finished. A trader who connected Schwab and pressed Sync at six and fourteen minutes
 * got "no activity" both times; three days later the same sync returned 880 activities. These pin
 * how the signal is read — and, more importantly, how its absence is read, because every broker
 * that does not report it has to keep syncing exactly as before.
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
  it('names the broker, says it is a wait, and says the sync was not used', () => {
    const line = historyLoadingMessage('Charles Schwab');
    expect(line).toBe(
      'Charles Schwab is still sending us your history. This usually takes a few minutes after connecting. Try again shortly. This did not use a sync.',
    );
  });

  it('falls back when the institution is unknown rather than printing null', () => {
    expect(historyLoadingMessage(null)).toMatch(/^Your broker is still sending/);
    expect(historyLoadingNote(undefined)).toContain('from your broker');
  });

  it('has a short form for the account row that still says what is happening', () => {
    const note = historyLoadingNote('Robinhood');
    expect(note).toContain('Robinhood');
    expect(note).toMatch(/still loading/i);
    expect(note.length).toBeLessThan(historyLoadingMessage('Robinhood').length);
  });
});
