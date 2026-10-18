import { describe, expect, it } from 'vitest';
import { dayBefore, nextSyncState, planSyncStart, type AccountSyncState } from './syncPlan';

/*
 * The window has to reach every position that is still open, or a close cannot find its open: an
 * option sale is dropped, a stock sale becomes a short that was never placed, and a sale can pair
 * with a different buy on the next sync and come in twice. These pin the rule that stops that.
 */

const state = (over: Partial<AccountSyncState> = {}): AccountSyncState => ({
  oldestOpenDate: null,
  complete: true,
  updatedAt: '2026-10-10T11:00:00.000Z',
  ...over,
});

describe('planSyncStart', () => {
  it('pulls everything the first time, whatever the caller asked for', () => {
    expect(planSyncStart('2026-10-01', null)).toEqual({ startDate: undefined, reason: 'first-sync' });
  });

  it('pulls everything while the last pull could not vouch for its open positions', () => {
    expect(planSyncStart('2026-10-01', state({ complete: false, oldestOpenDate: '2026-09-01' }))).toEqual({
      startDate: undefined,
      reason: 'repairing',
    });
  });

  it('uses the caller’s window when nothing is open', () => {
    expect(planSyncStart('2026-10-01', state())).toEqual({ startDate: '2026-10-01', reason: 'window' });
  });

  it('widens the window to the day before the oldest open position', () => {
    // Held since Sep 3; the caller would have started on Oct 1 and missed the buy.
    expect(planSyncStart('2026-10-01', state({ oldestOpenDate: '2026-09-03' }))).toEqual({
      startDate: '2026-09-02',
      reason: 'widened-for-open-position',
    });
  });

  it('leaves a window alone that already reaches the open position', () => {
    expect(planSyncStart('2026-08-20', state({ oldestOpenDate: '2026-09-03' }))).toEqual({
      startDate: '2026-08-20',
      reason: 'window',
    });
  });

  it('never narrows a request for everything', () => {
    expect(planSyncStart(undefined, state({ oldestOpenDate: '2026-09-03' })).startDate).toBeUndefined();
  });

  /*
   * A pull that ran out of time. The Robinhood case: 11,491 activities, 12 pages, and a function
   * killed at Netlify's limit. The next sync has to carry on from the first unread day, whatever the
   * journal's newest trade says — it holds nothing from that day on.
   */
  describe('after a pull that stopped early', () => {
    it('carries on from the first day the last pull did not read', () => {
      expect(planSyncStart('2026-10-01', state({ resumeFrom: '2025-06-12' }))).toEqual({
        startDate: '2025-06-12',
        reason: 'resuming',
      });
    });

    it('does not re-read the fortnight before the resume point for the caller’s overlap', () => {
      // The caller walks back 14 days from its newest trade, which is before the resume point. That
      // history was read minutes ago; re-asking for it spends the budget that ran out last time.
      expect(planSyncStart('2025-05-30', state({ resumeFrom: '2025-06-12' })).startDate).toBe('2025-06-12');
    });

    it('starts exactly at the cut when the lots open there travel with the state', () => {
      // The position opened on the 2nd is carried as a row, so it need not be read again — and a
      // position held since before every page the budget can reach would otherwise stop the pull
      // from ever getting past it.
      const lot = { id: 'o1', trade_date: '2025-06-02T15:00:00Z', units: 5, fee: 1 };
      expect(planSyncStart('2026-10-01', state({ resumeFrom: '2025-06-12', oldestOpenDate: '2025-06-02', openLots: [lot] }))).toEqual({
        startDate: '2025-06-12',
        reason: 'resuming',
        openLots: [lot],
      });
    });

    it('reaches back to a position left open at the cut when the state could not carry it', () => {
      expect(planSyncStart('2026-10-01', state({ resumeFrom: '2025-06-12', oldestOpenDate: '2025-06-02' }))).toEqual({
        startDate: '2025-06-01',
        reason: 'resuming',
      });
    });

    it('ignores the resume point of a state that cannot be trusted', () => {
      expect(planSyncStart('2026-10-01', state({ resumeFrom: '2025-06-12', complete: false })).reason).toBe('repairing');
    });

    it('resumes even when the caller asked for everything', () => {
      // "Everything" means everything unread; everything before the cut is already in the journal.
      expect(planSyncStart(undefined, state({ resumeFrom: '2025-06-12' })).startDate).toBe('2025-06-12');
    });
  });
});

describe('nextSyncState', () => {
  const now = '2026-10-15T11:00:00.000Z';
  const lot = { id: 'o1', trade_date: '2025-06-02T15:00:00Z', units: 5, fee: 1 };
  /** The matcher's outputs for a pull that reached the end with nothing open. */
  const finished = { resumeFrom: undefined, oldestOpenDate: null, openLots: [], observedDirection: null, now };

  it('is complete after a full-history pull that reached the end', () => {
    const next = nextSyncState({ previous: null, startDate: undefined, ...finished, oldestOpenDate: '2026-09-03', observedDirection: 'oldest-first' });
    expect(next).toEqual({ oldestOpenDate: '2026-09-03', complete: true, feedDirection: 'oldest-first', updatedAt: now });
  });

  it('is complete after a full-history pull that stopped early, as far as it went', () => {
    // The pull reads from the oldest end and hands over whole days, so what it reports open is
    // exactly what was open at the cut. The resume point and the open lots are stored beside it.
    const next = nextSyncState({ previous: null, startDate: undefined, resumeFrom: '2025-06-12', oldestOpenDate: '2025-06-02', openLots: [lot], observedDirection: null, now });
    expect(next).toEqual({ oldestOpenDate: '2025-06-02', complete: true, resumeFrom: '2025-06-12', openLots: [lot], updatedAt: now });
  });

  it('carries open lots only with a resume point', () => {
    // A finished pull's open lots are read again by the next window's overlap; seeding them too
    // would count every open twice.
    const next = nextSyncState({ previous: null, startDate: undefined, ...finished, oldestOpenDate: '2025-06-02', openLots: [lot] });
    expect('openLots' in next).toBe(false);
  });

  it('does not carry more lots than the document can hold', () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ id: `lot-${i}` }));
    const next = nextSyncState({ previous: null, startDate: undefined, resumeFrom: '2025-06-12', oldestOpenDate: '2025-01-02', openLots: many, observedDirection: null, now });
    expect('openLots' in next).toBe(false);
    expect(next.resumeFrom).toBe('2025-06-12');
  });

  it('drops the resume point and the carried lots once a pull reaches the end', () => {
    const previous = state({ resumeFrom: '2025-06-12', oldestOpenDate: '2025-06-02', openLots: [lot] });
    const next = nextSyncState({ previous, startDate: '2025-06-12', ...finished });
    expect(next.complete).toBe(true);
    expect('resumeFrom' in next).toBe(false);
    expect('openLots' in next).toBe(false);
  });

  it('stays complete when a resumed pull started at the cut with the carried lots', () => {
    // The window began after the open position, which is the one case that is fine: the position
    // was in hand already.
    const previous = state({ resumeFrom: '2025-06-12', oldestOpenDate: '2025-06-02', openLots: [lot] });
    expect(nextSyncState({ previous, startDate: '2025-06-12', ...finished }).complete).toBe(true);
  });

  it('loses completeness when a window started after the previous resume point', () => {
    // The days between the resume point and this window were never read.
    const previous = state({ resumeFrom: '2025-06-12', oldestOpenDate: null });
    expect(nextSyncState({ previous, startDate: '2025-07-01', ...finished }).complete).toBe(false);
  });

  it('stays complete when a window began at or before every open position', () => {
    const previous = state({ oldestOpenDate: '2026-09-03' });
    const next = nextSyncState({ previous, startDate: '2026-09-02', ...finished, oldestOpenDate: '2026-09-28' });
    expect(next.complete).toBe(true);
    expect(next.oldestOpenDate).toBe('2026-09-28');
  });

  it('loses completeness when a window started after an open position', () => {
    // The lot opened Sep 3 was outside this window, so whatever this pull saw as oldest is not the oldest.
    const previous = state({ oldestOpenDate: '2026-09-03' });
    expect(nextSyncState({ previous, startDate: '2026-09-20', ...finished, oldestOpenDate: '2026-09-28' }).complete).toBe(false);
  });

  it('loses completeness when a window started after the pull it follows', () => {
    // Nothing was open then, but anything opened between that pull and this window would be missed.
    const previous = state({ oldestOpenDate: null, updatedAt: '2026-10-01T11:00:00.000Z' });
    expect(nextSyncState({ previous, startDate: '2026-10-05', ...finished }).complete).toBe(false);
    expect(nextSyncState({ previous, startDate: '2026-09-30', ...finished }).complete).toBe(true);
  });

  it('cannot become complete by following an incomplete state', () => {
    const previous = state({ complete: false, oldestOpenDate: null });
    expect(nextSyncState({ previous, startDate: '2026-01-01', ...finished }).complete).toBe(false);
  });

  it('remembers the feed direction once seen, and keeps it through pulls that could not see it', () => {
    const learned = nextSyncState({ previous: null, startDate: undefined, ...finished, observedDirection: 'newest-first' });
    const kept = nextSyncState({ previous: learned, startDate: '2026-10-01', ...finished });
    expect(kept.feedDirection).toBe('newest-first');
    const never = nextSyncState({ previous: null, startDate: undefined, ...finished });
    expect('feedDirection' in never).toBe(false);
  });
});

describe('dayBefore', () => {
  it('steps back one calendar day, across a month and a year', () => {
    expect(dayBefore('2026-10-01')).toBe('2026-09-30');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });

  it('returns what it was given when that is not a date', () => {
    expect(dayBefore('nonsense')).toBe('nonsense');
  });
});
