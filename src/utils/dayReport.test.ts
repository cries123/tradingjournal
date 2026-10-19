import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { checkRuleViolations } from './tradingRules';
import { capReport, dayRuleLines, ordinal, runningTotals } from './dayReport';

let n = 0;
const t = (pnl: number): Trade => ({ id: `t${String(n++).padStart(4, '0')}`, date: '2026-09-17', symbol: 'SPY', pnl });
const fmt = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toFixed(0)}`;
// Sep 17 from the mockup: +160, −215, −204, +104, −296, −213.
const sep17 = () => [t(160), t(-215), t(-204), t(104), t(-296), t(-213)];
const rules = { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500, maxConsecutiveLosses: 3 };

describe('ordinal', () => {
  it('reads the way people say it', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });
});

describe('runningTotals', () => {
  it('carries the day forward trade by trade', () => {
    expect(runningTotals(sep17()).map((p) => p.running)).toEqual([160, -55, -259, -155, -451, -664]);
  });
});

describe('dayRuleLines', () => {
  it('names which trade crossed each line', () => {
    const lines = dayRuleLines(sep17(), rules, fmt);
    expect(lines.find((l) => l.type === 'max_trades')).toMatchObject({ broken: true, detail: 'Took 6. Past it from the 4th trade.' });
    expect(lines.find((l) => l.type === 'max_loss')).toMatchObject({ broken: true, detail: 'Finished at -$664, past it on the 6th trade.' });
    expect(lines.find((l) => l.type === 'max_streak')).toMatchObject({ broken: false, detail: 'Never more than 2 in a row.' });
  });

  it('agrees with the rule checker on every verdict, so the day page and the calendar mark match', () => {
    const days = [sep17(), [t(-500)], [t(-499)], [t(-100), t(-100), t(-100), t(-100)], [t(50), t(0), t(-1)], [t(-600), t(700)]];
    for (const day of days) {
      const broken = new Set(checkRuleViolations(day, rules).map((v) => v.type));
      for (const line of dayRuleLines(day, rules, fmt)) {
        expect(line.broken, `${line.type} on ${day.map((d) => d.pnl).join(',')}`).toBe(broken.has(line.type));
      }
    }
  });

  it('says so when a day went past the stop and came back, without calling it a breach', () => {
    const line = dayRuleLines([t(-600), t(700)], rules, fmt).find((l) => l.type === 'max_loss')!;
    expect(line.broken).toBe(false);
    expect(line.detail).toBe('Went to -$600 on the 1st trade, then finished at $100.');
  });

  it('lists only the rules the trader turned on, and nothing when rules are off', () => {
    expect(dayRuleLines(sep17(), { enabled: true, maxDailyLoss: 500 }, fmt).map((l) => l.type)).toEqual(['max_loss']);
    expect(dayRuleLines(sep17(), { enabled: false, maxDailyLoss: 500 }, fmt)).toEqual([]);
  });
});

describe('capReport', () => {
  it('is the day stopped at the cap, and what the rest cost', () => {
    expect(capReport(sep17(), 3)).toEqual({ cap: 3, kept: -259, actual: -664, after: -405, afterCount: 3 });
  });

  it('has nothing to say about a day inside the cap', () => {
    expect(capReport(sep17().slice(0, 3), 3)).toBeNull();
    expect(capReport(sep17(), undefined)).toBeNull();
  });
});
