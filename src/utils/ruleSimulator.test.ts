import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { rulesAreTestable, simulateRules } from './ruleSimulator';

/*
 * The simulator is the only screen in this product that makes a counterfactual claim, and somebody
 * is going to change how they trade because of the number on it. So the arithmetic is pinned here
 * rather than eyeballed against a chart — there is no chart.
 *
 * The cases that matter are the boundaries: a day that ends exactly on the limit, a day the rules
 * never touch, a rule that removes a winning afternoon.
 */

let seq = 0;
const trade = (date: string, pnl: number, entryTime?: string): Trade =>
  ({ id: `t${seq++}`, date, symbol: 'SPY', pnl, ...(entryTime ? { entryTime } : {}) }) as Trade;

const rules = (over: Partial<TradingRules> = {}): TradingRules => ({ enabled: true, ...over });

describe('rulesAreTestable', () => {
  it('is false when nothing is set', () => {
    expect(rulesAreTestable(rules())).toBe(false);
  });

  it('is false for a limit of zero, which cannot stop anything', () => {
    expect(rulesAreTestable(rules({ maxTradesPerDay: 0, maxDailyLoss: 0 }))).toBe(false);
  });

  it('is true for any one real limit', () => {
    expect(rulesAreTestable(rules({ maxTradesPerDay: 4 }))).toBe(true);
    expect(rulesAreTestable(rules({ maxDailyLoss: 500 }))).toBe(true);
    expect(rulesAreTestable(rules({ maxDailyGain: 500 }))).toBe(true);
  });
});

describe('simulateRules', () => {
  it('changes nothing when no rule is set', () => {
    const journal = [trade('2026-09-01', 100), trade('2026-09-01', -300)];
    const result = simulateRules(journal, rules());

    expect(result.actualPnl).toBe(-200);
    expect(result.simulatedPnl).toBe(-200);
    expect(result.difference).toBe(0);
    expect(result.changedDays).toEqual([]);
  });

  it('stops a day once the trade cap is reached', () => {
    const journal = [
      trade('2026-09-01', 100, '09:30'),
      trade('2026-09-01', 100, '09:40'),
      trade('2026-09-01', -900, '10:00'),
    ];
    const result = simulateRules(journal, rules({ maxTradesPerDay: 2 }));

    expect(result.actualPnl).toBe(-700);
    expect(result.simulatedPnl).toBe(200);
    expect(result.difference).toBe(900);
    expect(result.tradesRemoved).toBe(1);
    expect(result.changedDays[0]?.stoppedBy).toEqual({ rule: 'max_trades', atTrade: 3 });
  });

  it('stops a day once the loss limit is hit', () => {
    const journal = [
      trade('2026-09-01', -600, '09:30'),
      trade('2026-09-01', -400, '10:00'),
    ];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500 }));

    expect(result.simulatedPnl).toBe(-600);
    expect(result.lossesAvoided).toBe(400);
    expect(result.changedDays[0]?.stoppedBy?.rule).toBe('max_loss');
  });

  it('checks the limit after the trade, not before it', () => {
    /*
     * You cannot know a trade breaks your daily stop until it has closed, so the trade that crosses
     * the line is kept and the NEXT one is removed. Checking beforehand would delete the trade that
     * caused the breach and report a day that never happened.
     */
    const journal = [trade('2026-09-01', -500, '09:30'), trade('2026-09-01', -200, '10:00')];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500 }));

    expect(result.simulatedPnl).toBe(-500);
    expect(result.tradesRemoved).toBe(1);
  });

  it('counts a day that never reached its limit as unchanged', () => {
    const journal = [trade('2026-09-01', -100), trade('2026-09-01', -50)];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500, maxTradesPerDay: 5 }));

    expect(result.daysChanged).toBe(0);
    expect(result.difference).toBe(0);
  });

  it('does not count a day whose last trade happened to hit the cap', () => {
    // Nothing was removed, so nothing changed — reporting it would inflate "days cut short" with
    // days the rule had no effect on.
    const journal = [trade('2026-09-01', 10, '09:30'), trade('2026-09-01', 10, '10:00')];
    const result = simulateRules(journal, rules({ maxTradesPerDay: 2 }));

    expect(result.daysChanged).toBe(0);
    expect(result.changedDays).toEqual([]);
  });

  it('reports the winners it gave up alongside the losses it avoided', () => {
    // The honest half. A rule that stops a day removes its good trades too, and both numbers have
    // to be on screen or the feature is an advert for itself.
    const journal = [
      trade('2026-09-01', -600, '09:30'),
      trade('2026-09-01', 250, '10:00'),
      trade('2026-09-01', -400, '11:00'),
    ];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500 }));

    expect(result.winnersGivenUp).toBe(250);
    expect(result.lossesAvoided).toBe(400);
    // The two always explain the difference between the totals.
    expect(result.lossesAvoided - result.winnersGivenUp).toBe(result.difference);
  });

  it('can show a rule making things worse', () => {
    // Cutting a day short before it recovered. The screen has to be able to say so.
    const journal = [
      trade('2026-09-01', -600, '09:30'),
      trade('2026-09-01', 2000, '10:00'),
    ];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500 }));

    expect(result.difference).toBe(-2000);
    expect(result.winnersGivenUp).toBe(2000);
  });

  it('treats each day separately', () => {
    const journal = [
      trade('2026-09-01', -600, '09:30'),
      trade('2026-09-01', -400, '10:00'),
      trade('2026-09-02', -600, '09:30'),
      trade('2026-09-02', -400, '10:00'),
    ];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500 }));

    expect(result.tradingDays).toBe(2);
    expect(result.daysChanged).toBe(2);
    expect(result.simulatedPnl).toBe(-1200);
  });

  it('orders within a day by entry time when there is one', () => {
    // Recorded out of order, which a broker import can be. The loss came first in the day.
    const journal = [
      trade('2026-09-01', 300, '14:00'),
      trade('2026-09-01', -900, '09:30'),
    ];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500 }));

    expect(result.simulatedPnl).toBe(-900);
    expect(result.winnersGivenUp).toBe(300);
  });

  it('keeps the recorded order when no fill times exist', () => {
    // Schwab sends a date without a time, which is most journals here. The order they were
    // recorded is the only signal left, and it must be used rather than silently reordered.
    const journal = [trade('2026-09-01', -900), trade('2026-09-01', 300)];
    const result = simulateRules(journal, rules({ maxDailyLoss: 500 }));

    expect(result.simulatedPnl).toBe(-900);
  });

  it('puts the worst actual day first', () => {
    const journal = [
      trade('2026-09-01', -200, '09:30'), trade('2026-09-01', -200, '10:00'),
      trade('2026-09-02', -900, '09:30'), trade('2026-09-02', -900, '10:00'),
    ];
    const result = simulateRules(journal, rules({ maxDailyLoss: 100 }));

    expect(result.changedDays[0]?.date).toBe('2026-09-02');
  });

  it('survives an empty journal', () => {
    const result = simulateRules([], rules({ maxTradesPerDay: 4 }));
    expect(result.tradingDays).toBe(0);
    expect(result.difference).toBe(0);
  });

  it('ignores a trade with no date rather than inventing a day for it', () => {
    const journal = [trade('', 100), trade('2026-09-01', -50)];
    const result = simulateRules(journal, rules({ maxTradesPerDay: 4 }));
    expect(result.tradingDays).toBe(1);
  });
});
