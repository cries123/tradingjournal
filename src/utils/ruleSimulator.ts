import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { effectivePnl } from './tradeHelpers';

/**
 * What the journal would have looked like under rules the trader did not actually follow.
 *
 * The whole product tells somebody what happened. This is the one screen that tells them what
 * would have happened instead, which is the only form of "you overtrade" anybody acts on — a
 * number attached to their own days rather than advice.
 *
 * Pure, and deliberately so: it takes the trades and the rules and returns the answer, with no
 * clock, no storage and no ordering of its own. Every figure on the screen comes from here, so the
 * screen cannot round, re-count or re-explain anything differently.
 *
 * ONLY THE RULES THE PRODUCT CAN ALSO ENFORCE. maxTradesPerDay, maxDailyLoss and maxDailyGain are
 * the three TradingRules carries, and the live banner already warns on all three. Simulating a
 * fourth — consecutive losses, position size — would produce a number the journal has no way to
 * hold you to afterwards, and a simulator whose best finding cannot be saved is a demo.
 */

/** One day, once the rules have been applied to it. */
export interface SimulatedDay {
  date: string;
  /** Trades actually taken that day. */
  actualTrades: number;
  /** Trades that survive the rules. */
  keptTrades: number;
  actualPnl: number;
  simulatedPnl: number;
  /** Which rule stopped the day, and on which trade. Null when the day ran untouched. */
  stoppedBy: { rule: 'max_trades' | 'max_loss' | 'max_gain'; atTrade: number } | null;
}

export interface SimulationResult {
  actualPnl: number;
  simulatedPnl: number;
  /** simulatedPnl − actualPnl. Positive means the rules would have helped. */
  difference: number;
  tradingDays: number;
  totalTrades: number;
  daysChanged: number;
  tradesRemoved: number;
  /**
   * What the rules cost and what they saved, both of them.
   *
   * Shown together on purpose. Stopping a day removes its winners as well as its losers, and a
   * simulator that reports only the losses avoided is selling a rule rather than testing one —
   * the first time somebody's own good afternoon disappears into it they stop believing the
   * screen. These two always sum to the difference.
   */
  winnersGivenUp: number;
  lossesAvoided: number;
  /** Only the days the rules touched, worst first — the ones worth reading. */
  changedDays: SimulatedDay[];
}

const EMPTY: SimulationResult = {
  actualPnl: 0,
  simulatedPnl: 0,
  difference: 0,
  tradingDays: 0,
  totalTrades: 0,
  daysChanged: 0,
  tradesRemoved: 0,
  winnersGivenUp: 0,
  lossesAvoided: 0,
  changedDays: [],
};

/** True when at least one limit is set to something that can actually stop a day. */
export function rulesAreTestable(rules: TradingRules): boolean {
  return (
    (rules.maxTradesPerDay != null && rules.maxTradesPerDay > 0) ||
    (rules.maxDailyLoss != null && Math.abs(rules.maxDailyLoss) > 0) ||
    (rules.maxDailyGain != null && Math.abs(rules.maxDailyGain) > 0)
  );
}

/**
 * Trades grouped by day, each day in the order the trades were recorded.
 *
 * Within-day order matters — the rules stop a day partway through — and there is frequently no
 * fill time to sort by: Schwab's feed sends a date-only trade_date, so `hasTimeOfDay` is false for
 * most journals here. Where entryTime exists it is used; otherwise the recorded order stands, which
 * for a broker import is the order the matcher produced and for hand entry is the order they were
 * written. That is the best available answer, and it is stated on the screen rather than implied.
 */
function byDay(trades: Trade[]): Map<string, Trade[]> {
  const days = new Map<string, Trade[]>();
  for (const trade of trades) {
    if (!trade.date) continue;
    const list = days.get(trade.date);
    if (list) list.push(trade);
    else days.set(trade.date, [trade]);
  }

  for (const list of days.values()) {
    list.sort((a, b) => (a.entryTime ?? '').localeCompare(b.entryTime ?? ''));
  }
  return days;
}

/**
 * Replays one day and returns where the rules would have stopped it.
 *
 * The limits are checked AFTER each trade, not before, because that is when the trader learns
 * them: you cannot know a trade takes you past your daily stop until it has closed. So a day that
 * ends exactly on the limit keeps every trade, and the one that follows is the one removed — which
 * is also what checkRuleViolations does with a completed day.
 */
function replayDay(dayTrades: Trade[], rules: TradingRules): SimulatedDay {
  const date = dayTrades[0]?.date ?? '';
  const actualPnl = dayTrades.reduce((sum, t) => sum + effectivePnl(t), 0);

  const maxTrades = rules.maxTradesPerDay != null && rules.maxTradesPerDay > 0 ? rules.maxTradesPerDay : null;
  const lossLimit = rules.maxDailyLoss != null && Math.abs(rules.maxDailyLoss) > 0 ? Math.abs(rules.maxDailyLoss) : null;
  const gainLimit = rules.maxDailyGain != null && Math.abs(rules.maxDailyGain) > 0 ? Math.abs(rules.maxDailyGain) : null;

  let running = 0;
  let kept = 0;
  let stoppedBy: SimulatedDay['stoppedBy'] = null;

  for (const trade of dayTrades) {
    if (stoppedBy) break;

    running += effectivePnl(trade);
    kept += 1;

    // Checked in the order a trader would hit them: the count is knowable before the money is.
    if (maxTrades != null && kept >= maxTrades) {
      stoppedBy = { rule: 'max_trades', atTrade: kept + 1 };
    } else if (lossLimit != null && running <= -lossLimit) {
      stoppedBy = { rule: 'max_loss', atTrade: kept + 1 };
    } else if (gainLimit != null && running >= gainLimit) {
      stoppedBy = { rule: 'max_gain', atTrade: kept + 1 };
    }
  }

  /*
   * stoppedBy is reported as found, without a guard for "but nothing was actually removed".
   *
   * There was one, and it was unobservable: the loop can only exit early when stoppedBy is set, so
   * a day with keptTrades < actualTrades always has one — and a day where nothing was removed
   * never reaches changedDays, which is the only place these are read. A mutation test flipping the
   * guard changed no assertion, which is the definition of a branch not worth keeping.
   *
   * The invariant the caller relies on is the plain one: a day appears in changedDays only when
   * trades were removed, and every such day names what removed them.
   */
  return {
    date,
    actualTrades: dayTrades.length,
    keptTrades: kept,
    actualPnl,
    simulatedPnl: running,
    stoppedBy,
  };
}

export function simulateRules(trades: Trade[], rules: TradingRules): SimulationResult {
  if (trades.length === 0 || !rulesAreTestable(rules)) {
    // Not an error state. No rules set is the starting point of the screen, and the answer to
    // "what would have changed" is honestly nothing.
    const actualPnl = trades.reduce((sum, t) => sum + effectivePnl(t), 0);
    const days = byDay(trades);
    return {
      ...EMPTY,
      actualPnl,
      simulatedPnl: actualPnl,
      tradingDays: days.size,
      totalTrades: trades.length,
    };
  }

  const days = byDay(trades);
  const result: SimulationResult = { ...EMPTY, tradingDays: days.size, totalTrades: trades.length };
  const changed: SimulatedDay[] = [];

  for (const dayTrades of days.values()) {
    const day = replayDay(dayTrades, rules);

    result.actualPnl += day.actualPnl;
    result.simulatedPnl += day.simulatedPnl;

    if (day.keptTrades < day.actualTrades) {
      result.daysChanged += 1;
      result.tradesRemoved += day.actualTrades - day.keptTrades;
      changed.push(day);

      // Split by what each removed trade actually was, so the two figures explain the difference
      // rather than restating it.
      for (const removed of dayTrades.slice(day.keptTrades)) {
        const pnl = effectivePnl(removed);
        if (pnl >= 0) result.winnersGivenUp += pnl;
        else result.lossesAvoided += Math.abs(pnl);
      }
    }
  }

  result.difference = result.simulatedPnl - result.actualPnl;
  // Worst actual day first: the days that cost the most are the ones a trader wants to look at.
  result.changedDays = changed.sort((a, b) => a.actualPnl - b.actualPnl);

  return result;
}
