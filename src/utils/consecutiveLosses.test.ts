import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { checkRuleViolations, longestLosingStreak, tradesByDay } from './tradingRules';
import { ruleStandingToday } from './ruleStanding';
import { simulateRules } from './ruleSimulator';

/*
 * The one rule that is about the SEQUENCE rather than the total.
 *
 * Three losses in a row is a different signal from three losses spread across a good day, which is
 * why traders ask for this one — and why it is the first rule here whose answer depends on the
 * order of the day. Three separate places now have to agree what that order is: the violations
 * list, the live banner and the simulator. They share tradesByDay for exactly that reason, and
 * these tests check the three of them against the same days.
 */

let seq = 0;
const trade = (date: string, pnl: number, entryTime?: string): Trade =>
  ({ id: `t${seq++}`, date, symbol: 'SPY', pnl, ...(entryTime ? { entryTime } : {}) }) as Trade;

describe('longestLosingStreak', () => {
  it('counts a plain run', () => {
    expect(longestLosingStreak([trade('d', -1), trade('d', -1), trade('d', -1)])).toBe(3);
  });

  it('resets on a winner', () => {
    expect(longestLosingStreak([trade('d', -1), trade('d', -1), trade('d', 5), trade('d', -1)])).toBe(2);
  });

  it('reports the longest run, not the last', () => {
    expect(longestLosingStreak([trade('d', -1), trade('d', -1), trade('d', 5), trade('d', -1)])).toBe(2);
    expect(longestLosingStreak([trade('d', -1), trade('d', 5), trade('d', -1), trade('d', -1)])).toBe(2);
  });

  it('treats a scratch as neither', () => {
    // Exactly zero is not a loss, and counting it as a win would break a run of losers on a trade
    // where nothing actually happened.
    expect(longestLosingStreak([trade('d', -1), trade('d', 0), trade('d', -1)])).toBe(2);
  });

  it('is zero for a day with no losers', () => {
    expect(longestLosingStreak([trade('d', 5), trade('d', 5)])).toBe(0);
  });
});

describe('tradesByDay', () => {
  it('orders a day by entry time when there is one', () => {
    const out = tradesByDay([trade('2026-09-01', 1, '14:00'), trade('2026-09-01', 2, '09:30')]);
    expect(out.get('2026-09-01')?.map((t) => t.entryTime)).toEqual(['09:30', '14:00']);
  });

  it('keeps the recorded order when there are no times', () => {
    // Most journals here are Schwab imports with a date and no fill time.
    const out = tradesByDay([trade('2026-09-01', 1), trade('2026-09-01', 2)]);
    expect(out.get('2026-09-01')?.map((t) => t.pnl)).toEqual([1, 2]);
  });

  it('drops a trade with no date rather than inventing a day', () => {
    expect(tradesByDay([trade('', 1), trade('2026-09-01', 2)]).size).toBe(1);
  });
});

describe('checkRuleViolations, streak rule', () => {
  const rules = { enabled: true, maxConsecutiveLosses: 3 };

  it('flags a day that went past the limit', () => {
    const day = [trade('2026-09-01', -1), trade('2026-09-01', -1), trade('2026-09-01', -1), trade('2026-09-01', -1)];
    const out = checkRuleViolations(day, rules);
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('max_streak');
  });

  it('leaves a day that stopped exactly on the limit alone', () => {
    // Three of three is keeping the rule, not breaking it.
    const day = [trade('2026-09-01', -1), trade('2026-09-01', -1), trade('2026-09-01', -1)];
    expect(checkRuleViolations(day, rules)).toEqual([]);
  });

  it('does nothing when rules are off', () => {
    const day = [trade('2026-09-01', -1), trade('2026-09-01', -1), trade('2026-09-01', -1), trade('2026-09-01', -1)];
    expect(checkRuleViolations(day, { ...rules, enabled: false })).toEqual([]);
  });
});

describe('ruleStandingToday, streak warning', () => {
  const today = '2026-09-01';
  const rules = { enabled: true, maxConsecutiveLosses: 3 };

  it('warns one short of the limit', () => {
    const standing = ruleStandingToday([trade(today, -1), trade(today, -1)], rules, today);
    expect(standing?.warnings.map((w) => w.type)).toContain('max_streak');
    expect(standing?.level).toBe('approaching');
  });

  it('warns at the limit, where the next decision still matters', () => {
    const standing = ruleStandingToday([trade(today, -1), trade(today, -1), trade(today, -1)], rules, today);
    expect(standing?.warnings.some((w) => w.message.includes('3 losses in a row'))).toBe(true);
    expect(standing?.level).toBe('approaching');
  });

  it('stops warning once it is a breach — the warning has nothing left to change', () => {
    const day = [trade(today, -1), trade(today, -1), trade(today, -1), trade(today, -1)];
    const standing = ruleStandingToday(day, rules, today);
    expect(standing?.level).toBe('breached');
    expect(standing?.warnings.map((w) => w.type)).not.toContain('max_streak');
  });

  it('says nothing on a day that never strung losses together', () => {
    const standing = ruleStandingToday([trade(today, -1), trade(today, 5), trade(today, -1)], rules, today);
    expect(standing?.warnings.map((w) => w.type)).not.toContain('max_streak');
  });
});

describe('simulateRules, streak rule', () => {
  it('stops the day on the run and removes what came after', () => {
    const day = [
      trade('2026-09-01', -100, '09:30'),
      trade('2026-09-01', -100, '10:00'),
      trade('2026-09-01', -900, '11:00'),
      trade('2026-09-01', -900, '12:00'),
    ];
    const result = simulateRules(day, { enabled: true, maxConsecutiveLosses: 2 });

    expect(result.simulatedPnl).toBe(-200);
    expect(result.tradesRemoved).toBe(2);
    expect(result.changedDays[0]?.stoppedBy?.rule).toBe('max_streak');
  });

  it('counts the run as it happens, not the day total', () => {
    // A winner in the middle resets it, so this day never reaches two in a row and survives whole.
    const day = [
      trade('2026-09-01', -100, '09:30'),
      trade('2026-09-01', 50, '10:00'),
      trade('2026-09-01', -100, '11:00'),
    ];
    const result = simulateRules(day, { enabled: true, maxConsecutiveLosses: 2 });

    expect(result.daysChanged).toBe(0);
    expect(result.simulatedPnl).toBe(-150);
  });

  it('is testable on its own, with no other limit set', () => {
    const day = [trade('2026-09-01', -100, '09:30'), trade('2026-09-01', -100, '10:00')];
    const result = simulateRules(day, { enabled: true, maxConsecutiveLosses: 1 });
    expect(result.difference).toBe(100);
  });
});
