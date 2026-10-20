import { describe, expect, it } from 'vitest';
import { monthShareSoFar, replayHasRoom, replayUsed, replayUsedLabel } from './replayAllowance';
import { limitsFor, TIER_ORDER } from '../config/tiers';

/* A member's monthly market replay data, released a day at a time. */

describe('the monthly replay allowance', () => {
  it('is $20 a month on Diamond and nothing on any other plan', () => {
    for (const tier of TIER_ORDER) expect(limitsFor(tier).replayUsdPerMonth).toBe(tier === 'diamond' ? 20 : 0);
  });

  it('releases the month a day at a time, by the length of that month', () => {
    expect(monthShareSoFar('2026-11-10')).toBeCloseTo(10 / 30, 9);
    expect(monthShareSoFar('2026-10-31')).toBe(1);
    expect(monthShareSoFar('2027-02-14')).toBeCloseTo(14 / 28, 9);
    expect(monthShareSoFar('2028-02-29')).toBe(1);
  });

  it('cannot be spent on the first day: only that day’s share is open', () => {
    const first = monthShareSoFar('2026-11-01'); // $20 / 30 ≈ $0.67
    expect(replayHasRoom(0, 20, first)).toBe(true);
    expect(replayHasRoom(0.66, 20, first)).toBe(true);
    expect(replayHasRoom(0.67, 20, first)).toBe(false);
  });

  it('carries forward what was not used, so a quiet week is not lost', () => {
    // Nothing spent until the 10th: a third of the month is open, not one day's share.
    expect(replayHasRoom(6, 20, monthShareSoFar('2026-11-10'))).toBe(true);
    expect(replayHasRoom(6.7, 20, monthShareSoFar('2026-11-10'))).toBe(false);
  });

  it('opens the whole month on its last day and never more', () => {
    expect(replayHasRoom(19.99, 20, monthShareSoFar('2026-11-30'))).toBe(true);
    expect(replayHasRoom(20, 20, monthShareSoFar('2026-11-30'))).toBe(false);
  });

  it('allows nothing on a plan with no allowance', () => {
    expect(replayHasRoom(0, 0, 1)).toBe(false);
  });

  it('reports what is used as a share, and says "under 1%" rather than a misleading 0%', () => {
    expect(replayUsed(5, 20)).toBe(0.25);
    expect(replayUsed(30, 20)).toBe(1);
    expect(replayUsed(0, 0)).toBe(1);
    expect(replayUsedLabel(0)).toBe('none');
    expect(replayUsedLabel(0.004)).toBe('under 1%');
    expect(replayUsedLabel(0.25)).toBe('25%');
  });
});
