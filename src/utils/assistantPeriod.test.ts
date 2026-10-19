import { describe, expect, it } from 'vitest';
import { periodNoun, ruleLines, shortPeriodLabel } from './assistantPeriod';

describe('shortPeriodLabel', () => {
  it('shortens a month to three letters, for the toggle and a history row', () => {
    expect(shortPeriodLabel('September 2026')).toBe('Sep 2026');
    expect(shortPeriodLabel('May 2026')).toBe('May 2026');
  });

  it('leaves a year and All time as they are', () => {
    expect(shortPeriodLabel('2026')).toBe('2026');
    expect(shortPeriodLabel('All time')).toBe('All time');
  });
});

describe('periodNoun', () => {
  it('asks about a month by its name', () => {
    expect(periodNoun('month', 'September 2026')).toBe('September');
  });

  it('asks about a year by its number, and all time as all your trades', () => {
    // "What do you want to know about All time?" is not a sentence.
    expect(periodNoun('year', '2026')).toBe('2026');
    expect(periodNoun('all', 'All time')).toBe('all your trades');
  });
});

describe('ruleLines', () => {
  it('lists nothing when rules are off or none were handed over', () => {
    // The all-journals view hands the assistant no rules on purpose; the rail must not list any.
    expect(ruleLines(undefined)).toEqual([]);
    expect(ruleLines({ enabled: false, maxTradesPerDay: 3 })).toEqual([]);
  });

  it('says each limit the way the design does', () => {
    expect(ruleLines({ enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500, maxConsecutiveLosses: 3, maxDailyGain: 1200 })).toEqual([
      'Max 3 trades a day',
      'Stop at -$500 on the day',
      'Stop after 3 losers in a row',
      'Stop at +$1,200 on the day',
    ]);
  });

  it('keeps cents only when the limit has them', () => {
    expect(ruleLines({ enabled: true, maxDailyLoss: 512.5 })).toEqual(['Stop at -$512.50 on the day']);
  });

  it('writes the limit in the trader’s currency', () => {
    // de-DE puts a no-break space before the euro sign.
    expect(ruleLines({ enabled: true, maxDailyLoss: 500 }, 'EUR')).toEqual(['Stop at -500 € on the day']);
  });

  it('skips a limit set to nothing', () => {
    expect(ruleLines({ enabled: true, maxTradesPerDay: 0, maxDailyLoss: undefined })).toEqual([]);
  });

  it('uses the singular for one', () => {
    expect(ruleLines({ enabled: true, maxTradesPerDay: 1, maxConsecutiveLosses: 1 })).toEqual([
      'Max 1 trade a day',
      'Stop after 1 loser in a row',
    ]);
  });
});
