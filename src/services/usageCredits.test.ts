import { describe, expect, it } from 'vitest';
import { dailyUnitsSpent, decideSpend, MAX_CREDITS, readCredits, readUsageDay } from '../../server/usage';

/**
 * The bank of bonus units, and how a day's counter reads with it.
 *
 * The invariant that matters: a credit is the last thing spent and the first thing a refund puts
 * back, and forgiving a day never rewrites what was actually called.
 */
describe('reading a day', () => {
  it('counts against the cap only what was neither bonus nor forgiven', () => {
    expect(dailyUnitsSpent(readUsageDay({ count: 5, bonus: 2, forgiven: 1 }))).toBe(2);
    expect(dailyUnitsSpent(readUsageDay({ count: 3 }))).toBe(3);
    expect(dailyUnitsSpent(readUsageDay(undefined))).toBe(0);
  });

  it('never goes negative, whatever a hand-edited document says', () => {
    expect(dailyUnitsSpent(readUsageDay({ count: 1, forgiven: 4 }))).toBe(0);
    expect(readUsageDay({ count: -3, bonus: 'two', forgiven: null })).toEqual({ count: 0, bonus: 0, forgiven: 0 });
  });
});

describe('the bank', () => {
  it('reads missing or junk as empty and caps a runaway balance', () => {
    expect(readCredits(undefined)).toEqual({ sync: 0, ai: 0 });
    expect(readCredits({ sync: 'lots', ai: -2 })).toEqual({ sync: 0, ai: 0 });
    expect(readCredits({ sync: 2.9, ai: MAX_CREDITS * 10 })).toEqual({ sync: 2, ai: MAX_CREDITS });
  });
});

describe('deciding one request', () => {
  const day = (count: number, bonus = 0, forgiven = 0) => ({ count, bonus, forgiven });

  it('spends the daily allowance first, and reports what is left including the bank', () => {
    expect(decideSpend(day(0), 2, 3)).toEqual({ allowed: true, source: 'daily', remaining: 4, credits: 3 });
    expect(decideSpend(day(1), 2, 0)).toEqual({ allowed: true, source: 'daily', remaining: 0, credits: 0 });
  });

  it('dips into the bank only once the cap is reached', () => {
    expect(decideSpend(day(2), 2, 3)).toEqual({ allowed: true, source: 'credit', remaining: 2, credits: 2 });
    expect(decideSpend(day(2), 2, 1)).toEqual({ allowed: true, source: 'credit', remaining: 0, credits: 0 });
  });

  it('refuses when both are gone', () => {
    expect(decideSpend(day(2), 2, 0)).toEqual({ allowed: false, reason: 'capped' });
  });

  it('never lets credits unlock a feature the plan does not include', () => {
    expect(decideSpend(day(0), 0, 50)).toEqual({ allowed: false, reason: 'not_included' });
  });

  it('treats a forgiven day as fresh, without touching the record of the calls', () => {
    // Two spent, both given back: the cap sees zero, the count still says two.
    const forgiven = day(2, 0, 2);
    expect(dailyUnitsSpent(forgiven)).toBe(0);
    expect(forgiven.count).toBe(2);
    expect(decideSpend(forgiven, 2, 0)).toEqual({ allowed: true, source: 'daily', remaining: 1, credits: 0 });
  });

  it('does not count bonus units against the cap', () => {
    // Cap 1, spent 1 daily and 2 from credits: still exactly at the cap, not over it.
    expect(dailyUnitsSpent(day(3, 2))).toBe(1);
    expect(decideSpend(day(3, 2), 1, 0)).toEqual({ allowed: false, reason: 'capped' });
  });
});
