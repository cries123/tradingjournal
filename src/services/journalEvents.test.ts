import { describe, expect, it } from 'vitest';
import { describeEvent, wasWasted, type JournalEvent } from '../utils/journalEvents';

/*
 * The sentence a support thread actually reads.
 *
 * A paying customer cancelled saying their syncs ran, spent the day's allowance and imported
 * nothing, and there was no way to check whether that was true. syncUsage counts syncs and records
 * nothing about what any of them returned, so the only evidence was the trade total — which cannot
 * tell an empty sync from one that worked.
 *
 * These pin the interpretation rather than the storage, because the interpretation is the feature:
 * "12 activities, 0 trades" is data, and "the broker sent 12 activities and all 12 were DIVIDEND"
 * is the reply to the ticket.
 */

const sync = (over: Partial<NonNullable<JournalEvent['sync']>> = {}): JournalEvent => ({
  type: 'sync',
  at: '2026-09-21T13:51:00.000Z',
  sync: {
    accountId: 'acc-1',
    institution: 'Robinhood',
    activityCount: 40,
    tradesReturned: 12,
    unmatchedCloses: 0,
    ignored: 0,
    ignoredByType: {},
    truncated: false,
    syncsRemaining: 4,
    ...over,
  },
});

describe('describeEvent, for a sync', () => {
  it('names the broker, so a two-account trader can tell which one is quiet', () => {
    expect(describeEvent(sync())).toContain('Robinhood');
  });

  it('says plainly when a sync was spent for nothing', () => {
    // The exact complaint that prompted this. It has to be findable by eye in a long list.
    const empty = describeEvent(sync({ activityCount: 0, tradesReturned: 0 }));
    expect(empty).toContain('no activity at all');
    expect(empty).toContain('spent for nothing');
  });

  it('separates an empty feed from one that returned unusable activity', () => {
    // Two different problems with two different fixes: nothing to import, versus plenty to
    // import and nothing the matcher could pair.
    const unusable = describeEvent(
      sync({ activityCount: 12, tradesReturned: 0, ignored: 12, ignoredByType: { DIVIDEND: 12 } }),
    );

    expect(unusable).toContain('12 activities came back');
    expect(unusable).toContain('12 DIVIDEND');
    expect(unusable).not.toContain('no activity at all');
  });

  it('blames unmatched closes when that is the reason', () => {
    const out = describeEvent(sync({ activityCount: 6, tradesReturned: 0, unmatchedCloses: 6 }));
    expect(out).toContain('no opening fill');
  });

  it('lists the biggest ignored types first and stops at three', () => {
    const out = describeEvent(
      sync({
        activityCount: 9,
        tradesReturned: 0,
        ignored: 9,
        ignoredByType: { FEE: 1, DIVIDEND: 5, INTEREST: 2, REI: 1 },
      }),
    );

    expect(out).toContain('5 DIVIDEND');
    // Four types, three shown: a support line should not become a census.
    expect(out).not.toContain('REI');
  });

  it('reports a working sync without crying wolf', () => {
    const out = describeEvent(sync());
    expect(out).toContain('40 activities in, 12 trades out');
    expect(out).not.toContain('spent for nothing');
  });

  it('flags a truncated pull, because that looks like missing trades', () => {
    expect(describeEvent(sync({ truncated: true }))).toContain('older history was not fetched');
  });

  it('falls back when the institution is unknown rather than printing null', () => {
    expect(describeEvent(sync({ institution: null }))).toContain('a broker');
  });
});

describe('describeEvent, for a clear', () => {
  it('names the journal and the damage', () => {
    const out = describeEvent({
      type: 'clear',
      at: '2026-09-21T13:00:00.000Z',
      clear: { tradesRemoved: 434, journalId: 'j1', journalName: 'Robinhood' },
    });

    expect(out).toContain('Robinhood');
    expect(out).toContain('434');
  });

  it('uses the id when the journal had no name', () => {
    const out = describeEvent({
      type: 'clear',
      at: '2026-09-21T13:00:00.000Z',
      clear: { tradesRemoved: 1, journalId: 'j1', journalName: null },
    });

    expect(out).toContain('j1');
    expect(out).toContain('1 trade deleted');
  });
});

describe('wasWasted', () => {
  it('is true only for a sync that returned nothing', () => {
    expect(wasWasted(sync({ tradesReturned: 0 }))).toBe(true);
    expect(wasWasted(sync({ tradesReturned: 1 }))).toBe(false);
  });

  it('is never true for a clear, which is not a wasted sync', () => {
    expect(
      wasWasted({
        type: 'clear',
        at: '2026-09-21T13:00:00.000Z',
        clear: { tradesRemoved: 10, journalId: 'j1', journalName: 'x' },
      }),
    ).toBe(false);
  });
});
