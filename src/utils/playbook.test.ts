import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { Strategy } from '../types/strategy';
import {
  checklistScoreOf,
  cleanRules,
  MAX_RULE_LENGTH,
  MAX_RULES_PER_STRATEGY,
  readChecklist,
  ruleByRule,
  ticksFor,
} from './playbook';
import { disciplineStats } from './executionAnalytics';

const strategy = (criteria: string[], id = 'orb'): Strategy => ({ id, name: 'ORB', criteria, defaultTags: [] });

let n = 0;
const trade = (pnl: number, checklist: { rule: string; met: boolean }[], over: Partial<Trade> = {}): Trade => ({
  id: `t${n++}`,
  date: '2026-10-01',
  symbol: 'SPY',
  pnl,
  checklist,
  ...over,
});

describe('cleanRules', () => {
  it('trims, squeezes spaces and drops blanks and non-strings', () => {
    expect(cleanRules(['  Above   VWAP ', '', '   ', 7, null, 'Waited for the retest'])).toEqual([
      'Above VWAP',
      'Waited for the retest',
    ]);
  });

  it('keeps one copy of a rule whatever its case', () => {
    expect(cleanRules(['Size within plan', 'size within PLAN'])).toEqual(['Size within plan']);
  });

  it('caps the count and the length', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Rule ${i}`);
    expect(cleanRules(many)).toHaveLength(MAX_RULES_PER_STRATEGY);
    expect(cleanRules(['x'.repeat(500)])[0]).toHaveLength(MAX_RULE_LENGTH);
  });

  it('treats anything that is not a list as no rules', () => {
    // Every strategy saved before this existed has criteria: [] — and a corrupt document must not crash.
    expect(cleanRules(undefined)).toEqual([]);
    expect(cleanRules('Above VWAP')).toEqual([]);
  });
});

describe('readChecklist', () => {
  it('believes only well-formed ticks', () => {
    expect(readChecklist([{ rule: 'A', met: true }, { rule: 'B' }, { met: false }, 'C', null])).toEqual([
      { rule: 'A', met: true },
    ]);
    expect(readChecklist(undefined)).toEqual([]);
  });
});

describe('ticksFor', () => {
  it('offers the strategy rules, unticked, on a new trade', () => {
    expect(ticksFor(strategy(['Above VWAP', 'Waited for the retest']), undefined)).toEqual([
      { rule: 'Above VWAP', met: false },
      { rule: 'Waited for the retest', met: false },
    ]);
  });

  it('keeps the rules an old trade was ticked against, even after the playbook changed', () => {
    // Rewriting the record to today's rules would put ticks against rules that did not exist then.
    const old = { strategyId: 'orb', checklist: [{ rule: 'Old rule', met: true }] };
    expect(ticksFor(strategy(['New rule']), old)).toEqual([{ rule: 'Old rule', met: true }]);
  });

  it('starts fresh when the trade is moved to a different strategy', () => {
    const old = { strategyId: 'other', checklist: [{ rule: 'Old rule', met: true }] };
    expect(ticksFor(strategy(['New rule']), old)).toEqual([{ rule: 'New rule', met: false }]);
  });

  it('offers current rules on a trade that was never ticked', () => {
    expect(ticksFor(strategy(['New rule']), { strategyId: 'orb' })).toEqual([{ rule: 'New rule', met: false }]);
  });

  it('offers nothing without a strategy', () => {
    expect(ticksFor(undefined, { strategyId: 'orb', checklist: [{ rule: 'A', met: true }] })).toEqual([]);
  });
});

describe('checklistScoreOf', () => {
  it('counts the ticks rather than trusting a typed number', () => {
    expect(
      checklistScoreOf([
        { rule: 'A', met: true },
        { rule: 'B', met: true },
        { rule: 'C', met: false },
      ]),
    ).toBe(67);
    expect(checklistScoreOf([{ rule: 'A', met: false }])).toBe(0);
  });

  it('has no score when there were no rules', () => {
    expect(checklistScoreOf([])).toBeUndefined();
  });
});

describe('ruleByRule', () => {
  const retest = (met: boolean) => [{ rule: 'Waited for the retest', met }];

  it('puts the rule that costs most to skip first', () => {
    const trades = [
      ...[100, 120, 80].map((p) => trade(p, [{ rule: 'Waited for the retest', met: true }, { rule: 'Above VWAP', met: true }])),
      ...[-200, -150, -250].map((p) => trade(p, [{ rule: 'Waited for the retest', met: false }, { rule: 'Above VWAP', met: true }])),
      ...[90, 110, 100].map((p) => trade(p, [{ rule: 'Above VWAP', met: false }])),
    ];
    const rows = ruleByRule(trades);

    expect(rows.map((r) => r.rule)).toEqual(['Waited for the retest', 'Above VWAP']);
    expect(rows[0]).toMatchObject({ followed: 3, skipped: 3, followedPerTrade: 100, skippedPerTrade: -200, costOfSkipping: 300 });
    // Above VWAP: followed 6 trades averaging -50, skipped 3 averaging +100 — skipping it paid.
    expect(rows[1].costOfSkipping).toBeLessThan(0);
  });

  it('needs enough trades on both sides before it says anything', () => {
    const trades = [
      ...[1, 2, 3].map((p) => trade(p, retest(true))),
      ...[4, 5].map((p) => trade(p, retest(false))),
    ];
    expect(ruleByRule(trades)).toEqual([]);
    expect(ruleByRule(trades, 2)).toHaveLength(1);
  });

  it('treats one rule written in two cases, under two strategies, as one rule', () => {
    const trades = [
      ...[10, 10, 10].map((p) => trade(p, [{ rule: 'Size within plan', met: true }], { strategyId: 'a' })),
      ...[-10, -10, -10].map((p) => trade(p, [{ rule: 'size within PLAN', met: false }], { strategyId: 'b' })),
    ];
    const rows = ruleByRule(trades);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ followed: 3, skipped: 3 });
  });

  it('measures net of fees, the same way the rest of the screen does', () => {
    const trades = [
      ...[0, 0, 0].map(() => trade(999, retest(true), { grossPnl: 100, fees: 10 })),
      ...[0, 0, 0].map(() => trade(0, retest(false))),
    ];
    expect(ruleByRule(trades)[0].followedPerTrade).toBe(90);
  });
});

describe('the Discipline panel', () => {
  it('carries the rule-by-rule rows', () => {
    const trades = [
      ...[100, 100, 100].map((p) => trade(p, [{ rule: 'Waited for the retest', met: true }], { checklistScore: 100 })),
      ...[-50, -50, -50].map((p) => trade(p, [{ rule: 'Waited for the retest', met: false }], { checklistScore: 0 })),
    ];
    const stats = disciplineStats(trades);
    expect(stats?.rules[0]).toMatchObject({ rule: 'Waited for the retest', costOfSkipping: 150 });
  });
});
