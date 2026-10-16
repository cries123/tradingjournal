import { describe, expect, it } from 'vitest';
import { describeSyncResult, type SyncResult } from './syncOutcomeCopy';

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

  it('says no activity only when the broker sent none', () => {
    expect(describeSyncResult({ ...base, activityCount: 0, tradesReturned: 0, fresh: 0 })).toBe(
      'No trade activity came back from Schwab.',
    );
  });

  it('carries the refund sentence on the outcomes that were refunded', () => {
    const notice = 'This did not use one of your syncs, because nothing came back.';
    expect(describeSyncResult({ ...base, activityCount: 0, tradesReturned: 0, fresh: 0, refundNotice: notice })).toContain(notice);
    expect(describeSyncResult({ ...base, tradesReturned: 0, fresh: 0, refundNotice: notice })).toContain(notice);
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
