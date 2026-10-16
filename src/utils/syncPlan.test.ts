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
});

describe('nextSyncState', () => {
  const now = '2026-10-15T11:00:00.000Z';

  it('is complete after a full-history pull that was not cut off', () => {
    const next = nextSyncState({ previous: null, startDate: undefined, truncated: false, oldestOpenDate: '2026-09-03', observedDirection: 'oldest-first', now });
    expect(next).toEqual({ oldestOpenDate: '2026-09-03', complete: true, feedDirection: 'oldest-first', updatedAt: now });
  });

  it('is never complete after hitting the page cap, since the oldest opens are what was left out', () => {
    expect(nextSyncState({ previous: null, startDate: undefined, truncated: true, oldestOpenDate: '2026-09-03', observedDirection: null, now }).complete).toBe(false);
  });

  it('stays complete when a window began at or before every open position', () => {
    const previous = state({ oldestOpenDate: '2026-09-03' });
    const next = nextSyncState({ previous, startDate: '2026-09-02', truncated: false, oldestOpenDate: '2026-09-28', observedDirection: null, now });
    expect(next.complete).toBe(true);
    expect(next.oldestOpenDate).toBe('2026-09-28');
  });

  it('loses completeness when a window started after an open position', () => {
    // The lot opened Sep 3 was outside this window, so whatever this pull saw as oldest is not the oldest.
    const previous = state({ oldestOpenDate: '2026-09-03' });
    expect(nextSyncState({ previous, startDate: '2026-09-20', truncated: false, oldestOpenDate: '2026-09-28', observedDirection: null, now }).complete).toBe(false);
  });

  it('loses completeness when a window started after the pull it follows', () => {
    // Nothing was open then, but anything opened between that pull and this window would be missed.
    const previous = state({ oldestOpenDate: null, updatedAt: '2026-10-01T11:00:00.000Z' });
    expect(nextSyncState({ previous, startDate: '2026-10-05', truncated: false, oldestOpenDate: null, observedDirection: null, now }).complete).toBe(false);
    expect(nextSyncState({ previous, startDate: '2026-09-30', truncated: false, oldestOpenDate: null, observedDirection: null, now }).complete).toBe(true);
  });

  it('cannot become complete by following an incomplete state', () => {
    const previous = state({ complete: false, oldestOpenDate: null });
    expect(nextSyncState({ previous, startDate: '2026-01-01', truncated: false, oldestOpenDate: null, observedDirection: null, now }).complete).toBe(false);
  });

  it('remembers the feed direction once seen, and keeps it through pulls that could not see it', () => {
    const learned = nextSyncState({ previous: null, startDate: undefined, truncated: false, oldestOpenDate: null, observedDirection: 'newest-first', now });
    const kept = nextSyncState({ previous: learned, startDate: '2026-10-01', truncated: false, oldestOpenDate: null, observedDirection: null, now });
    expect(kept.feedDirection).toBe('newest-first');
    const never = nextSyncState({ previous: null, startDate: undefined, truncated: false, oldestOpenDate: null, observedDirection: null, now });
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
