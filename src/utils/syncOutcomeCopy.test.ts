import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeSyncResult, historyStillOnItsWay, type SyncResult } from './syncOutcomeCopy';

const base: SyncResult = {
  label: 'Schwab',
  activityCount: 40,
  tradesReturned: 20,
  fresh: 20,
  truncated: false,
  refundNotice: null,
};

describe('describeSyncResult', () => {
  it('says activity came back and did not pair, rather than that none was found', () => {
    // The complaint this exists for. "No trade activity found" sent people to check a connection
    // that was fine; the real reason is in the notes under this line.
    const line = describeSyncResult({ ...base, activityCount: 47, tradesReturned: 0, fresh: 0 });
    expect(line).toContain('47 activity rows came back from Schwab');
    expect(line).toContain('none paired');
    expect(line).not.toContain('No trade activity');
  });

  /*
   * Jay: "instead of saying no activity we need to say broker is still sending snaptrade your trade
   * history please wait and try again in 30 minutes … because people dont think it works and they
   * are canceling." An empty feed on a pull that asked for everything IS that — SnapTrade loads a
   * new connection in the background and answers empty until it has finished — whatever the
   * account's flag said. An empty narrow window on an account that has imported before is the
   * other normal case: nothing new, and SnapTrade delivers a day late anyway.
   */
  const empty = { ...base, institution: 'Charles Schwab', activityCount: 0, tradesReturned: 0, fresh: 0 };

  it('reads an empty full-history pull as the history still on its way', () => {
    for (const r of [
      { ...empty, windowReason: 'first-sync' as const },
      { ...empty, windowReason: 'repairing' as const },
      { ...empty, windowReason: 'window' as const, windowStart: null },
    ]) {
      expect(describeSyncResult(r)).toBe(
        'Charles Schwab is still sending SnapTrade your trade history, so there is nothing to import yet. Please wait and try again in about 30 minutes.',
      );
      expect(historyStillOnItsWay(r)).toBe(true);
    }
  });

  it('reads an empty narrow window as no new trades, and says when they arrive', () => {
    const r = { ...empty, windowReason: 'window' as const, windowStart: '2026-10-04' };
    expect(describeSyncResult(r)).toBe(
      'No new trades from Charles Schwab since your last sync. Trades usually arrive the day after they happen.',
    );
    expect(historyStillOnItsWay(r)).toBe(false);
  });

  it('never says "no activity"', () => {
    for (const r of [
      { ...empty, windowReason: 'first-sync' as const },
      { ...empty, windowReason: 'window' as const, windowStart: '2026-10-04' },
      { ...empty, windowReason: undefined, windowStart: undefined },
      { ...empty, windowReason: 'widened-for-open-position' as const, windowStart: '2026-09-30' },
    ]) {
      expect(describeSyncResult(r).toLowerCase()).not.toContain('no activity');
    }
  });

  it('names the broker, not the account, as the one still sending', () => {
    // The label is the account's display name ("Individual …1234"); the sentence is about Schwab.
    const line = describeSyncResult({ ...empty, label: 'Individual …1234', windowReason: 'first-sync' });
    expect(line).toMatch(/^Charles Schwab is still sending/);
    // With no institution to hand, the label is better than "undefined".
    expect(describeSyncResult({ ...empty, institution: undefined, windowReason: 'first-sync' })).toMatch(/^Schwab is still sending/);
  });

  it('does not claim to have read the full history when nothing came back', () => {
    expect(describeSyncResult({ ...empty, windowReason: 'first-sync' })).not.toContain('read your full history');
  });

  it('is only the history on its way when the feed was empty', () => {
    expect(historyStillOnItsWay({ ...base, windowReason: 'first-sync' })).toBe(false);
  });

  it('carries the refund sentence on the outcomes that were refunded', () => {
    const notice = 'This did not use one of your syncs, because nothing came back.';
    expect(describeSyncResult({ ...empty, windowReason: 'first-sync', refundNotice: notice })).toContain(notice);
    expect(describeSyncResult({ ...empty, windowReason: 'window', windowStart: '2026-10-04', refundNotice: notice })).toContain(notice);
    expect(describeSyncResult({ ...base, tradesReturned: 0, fresh: 0, refundNotice: notice })).toContain(notice);
  });

  it('routes the empty full-history pull to the wait box on the connect screen', () => {
    const screen = readFileSync('src/components/brokers/BrokerConnectContent.tsx', 'utf8');
    expect(screen).toContain('if (historyStillOnItsWay(outcome)) setWaiting(line);');
    expect(screen).toContain('institution: account.institutionName,');
  });

  it('says up to date when everything was already imported', () => {
    expect(describeSyncResult({ ...base, fresh: 0 })).toContain('all 20 trades from Schwab were already imported');
    expect(describeSyncResult({ ...base, tradesReturned: 1, fresh: 0 })).toContain('all 1 trade from Schwab was already imported');
  });

  it('counts what was imported and what was skipped', () => {
    expect(describeSyncResult({ ...base, fresh: 5 })).toBe('Imported 5 trades from Schwab (15 already up to date).');
    expect(describeSyncResult({ ...base, tradesReturned: 1, fresh: 1 })).toBe('Imported 1 trade from Schwab.');
  });

  it('says why a sync was slow, when the server widened or opened the window', () => {
    expect(describeSyncResult({ ...base, windowReason: 'first-sync' })).toContain('read your full history');
    expect(describeSyncResult({ ...base, windowReason: 'repairing' })).toContain('read your full history');
    expect(describeSyncResult({ ...base, windowReason: 'widened-for-open-position' })).toContain('position you still hold');
    expect(describeSyncResult({ ...base, windowReason: 'window' })).not.toMatch(/history|hold/);
  });

  it('names the page cap when it was hit', () => {
    expect(describeSyncResult({ ...base, truncated: true })).toContain('oldest history was left out');
  });
});
