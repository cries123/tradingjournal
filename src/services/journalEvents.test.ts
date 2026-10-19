import { readFileSync } from 'node:fs';
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
    const empty = describeEvent(sync({ activityCount: 0, tradesReturned: 0, refunded: false }));
    expect(empty).toContain('no activity at all');
    expect(empty).toContain('spent for nothing');
  });

  it('says a refunded sync was not charged, instead of calling it spent', () => {
    /*
     * The row claimed "A sync was spent for nothing" of every empty manual sync, while the handler
     * had refunded it a line earlier — so a trader whose two syncs of a brand-new connection came
     * back empty read, twice, that they had paid for nothing, under a count that said otherwise.
     */
    for (const row of [
      sync({ activityCount: 0, tradesReturned: 0, refunded: true }),
      sync({ activityCount: 12, tradesReturned: 0, ignored: 12, ignoredByType: { DIVIDEND: 12 }, refunded: true }),
    ]) {
      const out = describeEvent(row);
      expect(out).toContain('This sync was not charged.');
      expect(out).not.toContain('spent for nothing');
    }
  });

  it('makes no claim about the charge on a row written before it was recorded', () => {
    // Those rows cannot tell a charged sync from a refunded one, and most of the empty ones were
    // refunded. Saying nothing is the only line that cannot be wrong.
    const old = describeEvent(sync({ activityCount: 0, tradesReturned: 0 }));
    expect(old).toContain('no activity at all');
    expect(old).not.toContain('spent for nothing');
    expect(old).not.toContain('not charged');
  });

  it('never mentions the charge on an automatic run, which spends nothing', () => {
    const out = describeEvent(sync({ activityCount: 0, tradesReturned: 0, automatic: true, refunded: false }));
    expect(out).not.toContain('spent for nothing');
    expect(out).not.toContain('not charged');
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

  /*
   * The row that started this: "Synced Robinhood — 11,491 activities in, 8,790 trades out", for an
   * answer the browser never received. Two facts were missing from it, and both are here now.
   */
  it('says where a pull that ran out of time stopped, and that it was not charged', () => {
    const out = describeEvent(sync({ partial: true, resumeFrom: '2025-06-12', tradesReturned: 1204 }));
    expect(out).toContain('Ran out of time at 2025-06-12');
    expect(out).toContain('continues from there');
    expect(describeEvent(sync({ partial: true, resumeFrom: '2025-06-12', tradesReturned: 0 }))).not.toContain('spent for nothing');
  });

  it('says when the browser never confirmed saving the trades', () => {
    expect(describeEvent(sync({ landed: false }))).toContain('Not confirmed as saved by the browser');
    expect(describeEvent(sync({ landed: true, fresh: 12 }))).not.toContain('Not confirmed');
    expect(describeEvent(sync({ landed: true, fresh: 12 }))).toContain('12 new');
    // Rows older than the field, and automatic runs, say nothing either way.
    expect(describeEvent(sync())).not.toContain('confirmed');
  });

  it('says a sync carried on from where the last one stopped', () => {
    expect(describeEvent(sync({ windowReason: 'resuming' }))).toContain('Carried on from where the last pull stopped');
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

describe('describeEvent, as the trader reads it', () => {
  /*
   * Jay: "instead of saying no activity we need to say broker is still sending snaptrade your trade
   * history please wait and try again in 30 minutes … because people dont think it works and they
   * are canceling." The trader's own history is the second place they read it, after the connect
   * screen, so it says the same thing — and never "no activity" or "spent for nothing".
   */
  const empty = (over: Partial<NonNullable<JournalEvent['sync']>> = {}) =>
    sync({ activityCount: 0, tradesReturned: 0, institution: 'Charles Schwab', refunded: true, ...over });

  it('reads an empty full-history pull as the history still on its way, with the wait and the cost', () => {
    for (const row of [empty({ windowReason: 'first-sync' }), empty({ windowReason: 'repairing' }), empty({ windowStart: null })]) {
      const line = describeEvent(row, 'trader');
      expect(line).toBe(
        'Charles Schwab was still sending SnapTrade your trade history, so there was nothing to import yet. Try again in about 30 minutes. This did not use a sync.',
      );
    }
  });

  it('does not depend on the flag: a full pull that came back empty reads the same way', () => {
    // The flag was already true, or missing, for the connection that prompted this — the feed was
    // empty all the same. windowStart null is the full pull, whatever the reason recorded.
    const line = describeEvent(empty({ windowReason: 'window', windowStart: null }), 'trader');
    expect(line).toContain('still sending SnapTrade your trade history');
  });

  it('reads an empty narrow window as no new trades, which is the normal day-late delivery', () => {
    const line = describeEvent(empty({ windowReason: 'window', windowStart: '2026-10-04' }), 'trader');
    expect(line).toBe(
      'Synced Charles Schwab — no new trades since your last sync. Trades usually arrive the day after they happen. This did not use a sync.',
    );
    expect(line).not.toContain('still sending');
  });

  it('never shows the trader "no activity" or "spent for nothing"', () => {
    for (const row of [
      empty({ windowReason: 'first-sync' }),
      empty({ windowReason: 'window', windowStart: '2026-10-04' }),
      empty({ windowReason: 'first-sync', refunded: false }),
      empty({ windowReason: 'first-sync', refunded: undefined }),
      empty({ activityCount: 12, ignored: 12, ignoredByType: { DIVIDEND: 12 } }),
      empty({ automatic: true, windowReason: 'first-sync' }),
      empty({ automatic: true, windowReason: 'window', windowStart: '2026-10-04' }),
    ]) {
      const line = describeEvent(row, 'trader');
      expect(line.toLowerCase(), line).not.toContain('no activity');
      expect(line, line).not.toContain('spent for nothing');
    }
  });

  it('says nothing about the cost on a row that cannot know it', () => {
    expect(describeEvent(empty({ windowReason: 'first-sync', refunded: undefined }), 'trader')).not.toContain('sync.');
  });

  it('tells a Diamond trader the morning import will try again', () => {
    const line = describeEvent(empty({ automatic: true, windowReason: 'first-sync' }), 'trader');
    expect(line).toContain('Morning import from Charles Schwab');
    expect(line).toContain('still sending SnapTrade your trade history');
    expect(line).toContain('The next import will try again.');
  });

  it('falls back to "your broker" rather than "a broker"', () => {
    const line = describeEvent(empty({ institution: null, windowReason: 'first-sync' }), 'trader');
    expect(line).toMatch(/^Your broker was still sending/);
  });

  it('keeps the matcher explanation when activity came back and nothing paired', () => {
    const line = describeEvent(empty({ activityCount: 6, unmatchedCloses: 6 }), 'trader');
    expect(line).toContain('6 activities came back but nothing paired into a trade.');
    expect(line).toContain('no opening fill');
    expect(line).toContain('This did not use a sync.');
  });

  it('leaves a working sync alone', () => {
    expect(describeEvent(sync(), 'trader')).toBe(describeEvent(sync()));
  });

  it('never tells a trader to wait for the history when the pull was only cut short', () => {
    // Empty and a full pull, but stopped by the clock before its first rows: the history is not
    // "still on its way", the next sync carries on from the cut.
    const cut = empty({ windowReason: 'first-sync', windowStart: null, partial: true, resumeFrom: '2025-06-12' });
    const trader = describeEvent(cut, 'trader');
    expect(trader).not.toContain('still sending');
    expect(trader).toContain('the next sync continues from there');
    expect(trader).toContain('This did not use a sync.');
    const support = describeEvent(cut);
    expect(support).not.toContain('still loading');
    expect(support).toContain('Ran out of time at 2025-06-12');
  });

  it('keeps the raw fact for support, with a hint when the pull was a full one', () => {
    const line = describeEvent(empty({ windowReason: 'first-sync' }));
    expect(line).toContain('the broker returned no activity at all');
    expect(line).toContain('SnapTrade was most likely still loading it');
    expect(line).toContain('This sync was not charged.');
    expect(describeEvent(empty({ windowReason: 'window', windowStart: '2026-10-04' }))).not.toContain('still loading');
  });

  it('is what the connect screen shows, while the admin panel keeps the support line', () => {
    const screen = readFileSync('src/components/brokers/BrokerConnectContent.tsx', 'utf8');
    expect(screen).toContain("describe={(e) => describeEvent(e, 'trader')}");
    const admin = readFileSync('src/components/admin/AdminJournalEventsSection.tsx', 'utf8');
    expect(admin).toContain('{describeEvent(event)}');
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
