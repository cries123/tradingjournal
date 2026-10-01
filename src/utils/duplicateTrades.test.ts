import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import {
  dedupeIncomingTrades,
  executionFingerprint,
  findDuplicateTrades,
} from './duplicateTrades';

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

  it('imports both halves of a repeated round trip arriving in one sync', () => {
    /*
     * The second real trade of an identical pair used to be counted "already imported" and silently
     * dropped, because each accepted row added its fingerprint to the seen set as well as its id.
     *
     * Two rows like these are routine on a Schwab feed: the feed carries no fill time, so a trader
     * who takes the same 0DTE contract twice for the same size and the same result produces two
     * rows identical in every field the fingerprint reads. Their sourceIds differ, and that is the
     * only thing that distinguishes them — so it has to be the only thing that decides.
     */
    const { fresh } = dedupeIncomingTrades(
      [
        incoming('snaptrade:o1:c1', { quantity: 1, tradePrice: 2, exitPrice: 2.4 }),
        incoming('snaptrade:o2:c2', { quantity: 1, tradePrice: 2, exitPrice: 2.4 }),
      ],
      [],
    );

    expect(fresh).toHaveLength(2);
    expect(fresh.map((t) => t.sourceId)).toEqual(['snaptrade:o1:c1', 'snaptrade:o2:c2']);
  });

  it('still refuses the same fill twice in one sync', () => {
    // The protection that must survive the fix above: one sourceId, imported once.
    const { fresh, alreadyKnown } = dedupeIncomingTrades(
      [incoming('snaptrade:o1:c1'), incoming('snaptrade:o1:c1')],
      [],
    );
    expect(fresh).toHaveLength(1);
    expect(alreadyKnown).toBe(1);
  });

  it('ignores existing manual trades, which carry no sourceId', () => {
    // A hand-logged trade is never a sync candidate and must not make a real one look known.
    const manual = { id: 'm1', date: '2026-07-14', symbol: 'SPY', pnl: -100 } as Trade;
    const { fresh } = dedupeIncomingTrades([incoming('abc')], [manual]);
    expect(fresh).toHaveLength(1);
  });
});

describe('findDuplicateTrades', () => {
  /*
   * This report has a bulk delete wired to it, and it had no tests. Everything below is about the
   * one asymmetry that matters: a duplicate this misses stays on screen, a real trade this names
   * gets deleted.
   */
  const row = (over: Partial<Trade>): Trade =>
    ({ id: 'r', date: '2026-07-14', symbol: 'SPY', pnl: 120, ...over }) as Trade;

  it('names the second copy of one fill and keeps the annotated one', () => {
    const bare = row({ id: 'bare', sourceId: 'snaptrade:o1:c1' });
    const annotated = row({
      id: 'annotated',
      sourceId: 'snaptrade:o1:c1',
      notes: 'broke the range, sized right',
      grade: 'A',
    });

    const report = findDuplicateTrades([bare, annotated]);

    expect(report.duplicates.map((t) => t.id)).toEqual(['bare']);
    expect(report.affectedTrades).toBe(1);
    expect(report.duplicatedPnl).toBe(120);
  });

  it('does not offer a real trade for deletion because it looks like another one', () => {
    /*
     * The bug. Grouping was by execution fingerprint, which on a Schwab feed has no fill time in
     * it, so taking the same contract twice for the same size and the same result produced one
     * group — and this told the trader one of the two was a duplicate.
     *
     * Different sourceId means a different fill, by construction: fallbackActivityId counts
     * occurrences precisely so that two identical fills get different ids.
     */
    const first = row({ id: 'first', sourceId: 'snaptrade:o1:c1', quantity: 1, tradePrice: 2 });
    const second = row({ id: 'second', sourceId: 'snaptrade:o2:c2', quantity: 1, tradePrice: 2 });

    expect(executionFingerprint(first)).toBe(executionFingerprint(second));
    expect(findDuplicateTrades([first, second])).toEqual({
      duplicates: [],
      affectedTrades: 0,
      duplicatedPnl: 0,
    });
  });

  it('leaves hand-logged trades alone however alike they are', () => {
    // Scaling into a level twice is not a duplicate, and there is no broker record to prove it is.
    const a = row({ id: 'a' });
    const b = row({ id: 'b' });
    expect(findDuplicateTrades([a, b]).duplicates).toEqual([]);
  });

  it('does not reach across journals', () => {
    // Collapsing across journals would delete out of one the trader was not even looking at.
    const here = row({ id: 'here', sourceId: 'snaptrade:o1:c1', accountId: 'journal-a' });
    const there = row({ id: 'there', sourceId: 'snaptrade:o1:c1', accountId: 'journal-b' });
    expect(findDuplicateTrades([here, there]).duplicates).toEqual([]);
  });

  it('keeps the copy saved first when neither is annotated', () => {
    // A stable answer, so the same cleanup run twice does not propose a different victim.
    const older = row({ id: 'older', sourceId: 'snaptrade:o1:c1', savedAt: '2026-07-14T13:00:00Z' });
    const newer = row({ id: 'newer', sourceId: 'snaptrade:o1:c1', savedAt: '2026-07-20T13:00:00Z' });

    expect(findDuplicateTrades([newer, older]).duplicates.map((t) => t.id)).toEqual(['newer']);
  });

  it('counts three copies of one trade as one affected trade', () => {
    const copies = ['a', 'b', 'c'].map((id) => row({ id, sourceId: 'snaptrade:o1:c1', pnl: 50 }));
    const report = findDuplicateTrades(copies);

    expect(report.affectedTrades).toBe(1);
    expect(report.duplicates).toHaveLength(2);
    expect(report.duplicatedPnl).toBe(100);
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
