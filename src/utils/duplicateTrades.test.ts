import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { dedupeIncomingTrades, executionFingerprint } from './duplicateTrades';

/**
 * This is the filter standing between a broker sync and a trader's journal, and getting it wrong
 * has already cost this app a duplicated month of history once. Every case below is a way that
 * happened or could happen again.
 */

const existing = (sourceId: string, over: Partial<Trade> = {}): Trade =>
  ({ id: `t-${sourceId}`, date: '2026-07-14', symbol: 'SPY', pnl: -100, sourceId, ...over }) as Trade;

const incoming = (sourceId: string | undefined, over: Partial<Trade> = {}): Partial<Trade> => ({
  date: '2026-07-14',
  symbol: 'SPY',
  pnl: -100,
  sourceId,
  ...over,
});

describe('dedupeIncomingTrades', () => {
  it('skips a trade the journal already has', () => {
    const { fresh, alreadyKnown } = dedupeIncomingTrades([incoming('abc')], [existing('abc')]);
    expect(fresh).toHaveLength(0);
    expect(alreadyKnown).toBe(1);
  });

  it('keeps a genuinely new trade', () => {
    const { fresh } = dedupeIncomingTrades(
      [incoming('abc'), incoming('new', { pnl: 42 })],
      [existing('abc')],
    );
    expect(fresh).toHaveLength(1);
    expect(fresh[0].sourceId).toBe('new');
  });

  it('drops a row with no sourceId rather than importing it', () => {
    // Nothing about such a row can be recognised on a later sync, so importing it guarantees a
    // fresh copy every time anyone presses Sync.
    const { fresh, unidentified } = dedupeIncomingTrades([incoming(undefined)], []);
    expect(fresh).toHaveLength(0);
    expect(unidentified).toBe(1);
  });

  it('imports an unidentifiable row zero times across repeated syncs', () => {
    let journal: Trade[] = [];
    for (let i = 0; i < 5; i++) {
      const { fresh } = dedupeIncomingTrades([incoming(undefined), incoming('real')], journal);
      journal = [...journal, ...fresh.map((t, n) => ({ ...t, id: `${i}-${n}` }) as Trade)];
    }
    expect(journal).toHaveLength(1);
    expect(journal[0].sourceId).toBe('real');
  });

  it('recognises a trade by execution fingerprint when its sourceId changed', () => {
    // Rows imported before the id bug carry a random component in their sourceId and will never
    // match again. Without this check every one of them returns as new on the next sync.
    const old = existing('snaptrade_acc1_1699999999_0_random', {
      quantity: 2,
      tradePrice: 400,
      exitPrice: 395,
    });
    const { fresh } = dedupeIncomingTrades(
      [incoming('stable-id', { quantity: 2, tradePrice: 400, exitPrice: 395 })],
      [old],
    );
    expect(fresh).toHaveLength(0);
  });

  it('adds a round trip once when two accounts both report it', () => {
    // The shared seen-set is what makes this work across accounts in one run.
    const seen = new Set<string>();
    const first = dedupeIncomingTrades([incoming('shared')], [], seen);
    const second = dedupeIncomingTrades([incoming('shared')], [], seen);
    expect(first.fresh).toHaveLength(1);
    expect(second.fresh).toHaveLength(0);
  });

  it('does not match two genuinely different trades that share a fingerprint field', () => {
    const { fresh } = dedupeIncomingTrades(
      [incoming('b', { pnl: -200 })],
      [existing('a', { pnl: -100 })],
    );
    expect(fresh).toHaveLength(1);
  });

  it('treats an empty journal as "nothing is known", not "everything is known"', () => {
    const { fresh } = dedupeIncomingTrades([incoming('a'), incoming('b', { pnl: 5 })], []);
    expect(fresh).toHaveLength(2);
  });

  it('ignores existing manual trades, which carry no sourceId', () => {
    // A hand-logged trade is never a sync candidate and must not make a real one look known.
    const manual = { id: 'm1', date: '2026-07-14', symbol: 'SPY', pnl: -100 } as Trade;
    const { fresh } = dedupeIncomingTrades([incoming('abc')], [manual]);
    expect(fresh).toHaveLength(1);
  });
});

describe('executionFingerprint', () => {
  it('matches two records of the same fill', () => {
    const a = existing('x', { quantity: 3, tradePrice: 10, exitPrice: 12, entryTime: '09:35' });
    const b = existing('y', { quantity: 3, tradePrice: 10, exitPrice: 12, entryTime: '09:35' });
    expect(executionFingerprint(a)).toBe(executionFingerprint(b));
  });

  it('separates fills that differ only by size', () => {
    const a = existing('x', { quantity: 3 });
    const b = existing('y', { quantity: 4 });
    expect(executionFingerprint(a)).not.toBe(executionFingerprint(b));
  });
});
