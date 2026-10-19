import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { checkRuleViolations, longestLosingStreak } from './tradingRules';
import { todayMeters, trailingLosers } from './todayMeters';

let n = 0;
const t = (pnl: number): Trade => ({ id: `t${n++}`, date: '2026-09-17', symbol: 'SPY', pnl });
const rules = { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500, maxConsecutiveLosses: 3 };

describe('todayMeters', () => {
  it('reads an untouched day as room on every limit', () => {
    const m = todayMeters([], rules);
    expect(m.trades).toMatchObject({ count: 0, limit: 3, state: 'ok' });
    expect(m.loss).toMatchObject({ left: 500, state: 'ok' });
    expect(m.streak).toMatchObject({ current: 0, state: 'ok' });
  });

  it('marks the cap reached, then passed', () => {
    expect(todayMeters([t(1), t(1), t(1)], rules).trades?.state).toBe('at');
    expect(todayMeters([t(1), t(1), t(1), t(1)], rules).trades?.state).toBe('over');
  });

  it('counts loss room from the day net, and agrees with the rule about when the stop is broken', () => {
    const near = todayMeters([t(-420)], rules);
    expect(near.loss).toMatchObject({ left: 80, state: 'near' });

    const atStop = [t(-500)];
    expect(todayMeters(atStop, rules).loss?.state).toBe('over');
    // The rule itself breaks at exactly the limit, so the gauge must not call it merely "at".
    expect(checkRuleViolations(atStop, rules).some((v) => v.type === 'max_loss')).toBe(true);
  });

  it('gives back loss room when the day recovers', () => {
    expect(todayMeters([t(-300), t(250)], rules).loss?.left).toBe(450);
  });

  it('never reports more loss room than the limit on a green day', () => {
    expect(todayMeters([t(900)], rules).loss?.left).toBe(500);
  });

  it('counts only the losers at the end of the day toward the streak', () => {
    expect(trailingLosers([t(-1), t(-1), t(5), t(-1)])).toBe(1);
    expect(trailingLosers([t(5), t(-1), t(-1)])).toBe(2);
    expect(todayMeters([t(-1), t(-1), t(-1)], rules).streak?.state).toBe('at');
  });

  it('treats a scratch the way the streak rule does: neither a loser nor a break', () => {
    const day = [t(-1), t(0), t(-1), t(-1)];
    expect(trailingLosers(day)).toBe(3);
    expect(longestLosingStreak(day)).toBe(3);
  });

  it('draws no gauge for a limit the trader did not set', () => {
    const m = todayMeters([t(-1)], { enabled: true, maxDailyLoss: 500 });
    expect(m.trades).toBeUndefined();
    expect(m.streak).toBeUndefined();
    expect(m.loss).toBeDefined();
  });
});
