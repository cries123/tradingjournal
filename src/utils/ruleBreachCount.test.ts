import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { buildJournalFacts, suggestedQuestions } from './journalFacts';
import { checkRuleViolations } from './tradingRules';

/*
 * "I broke my rules N×" counts every breach, not the ten the model is shown.
 *
 * The facts keep the first ten breaches for the prompt and the suggestion counted that list, so a
 * month with fourteen read "10×" directly under an answer that said fourteen.
 */

const rules = { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 0, maxConsecutiveLosses: 0 } as Parameters<typeof checkRuleViolations>[1];

/** Fourteen weekdays in June 2026, each with four small winners: one breach a day, of the 3-trade cap. */
function overtradedMonth(): Trade[] {
  const trades: Trade[] = [];
  let day = 1;
  let n = 0;
  while (n < 14) {
    const date = `2026-06-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    day += 1;
    if (weekday === 0 || weekday === 6) continue;
    for (let i = 0; i < 4; i++) trades.push({ id: `${date}-${i}`, date, symbol: 'SPY', pnl: 25 + i, side: 'long' } as Trade);
    n += 1;
  }
  return trades;
}

describe('the rule-break suggestion', () => {
  const trades = overtradedMonth();
  const total = checkRuleViolations(trades, rules).length;
  const facts = buildJournalFacts(trades, 'June 2026', { rules })!;

  it('counts every breach in the period', () => {
    expect(total).toBeGreaterThan(10);
    expect(facts.ruleBreachCount).toBe(total);
    const chip = suggestedQuestions(facts).find((s) => s.id === 'rules');
    expect(chip?.label).toBe(`I broke my rules ${total}×`);
  });

  it('still shows the model ten examples, not the whole list', () => {
    expect(facts.ruleBreaches).toHaveLength(10);
  });

  it('says nothing about breaches when no rules are set', () => {
    const none = buildJournalFacts(trades, 'June 2026', {})!;
    expect(none.ruleBreaches).toBeNull();
    expect(none.ruleBreachCount).toBe(0);
    expect(suggestedQuestions(none).some((s) => s.id === 'rules')).toBe(false);
  });
});
