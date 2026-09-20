import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { effectivePnl } from './tradeHelpers';
import { checkRuleViolations, longestLosingStreak, tradesByDay, type RuleViolation } from './tradingRules';

/**
 * Where today stands against the limits the trader set for themselves.
 *
 * The risk rules have been in this journal since long before anything read them back. A trader
 * could set a $500 daily stop, blow through it at eleven in the morning, and find out from a list
 * on the insights panel that evening — which is a record of the mistake rather than a chance not
 * to make it.
 *
 * Two things are worth saying and only one of them is a breach. "You are one trade from your cap"
 * can still change the next decision; "you went four over" cannot. So warnings are computed
 * separately and come first in the UI, and the breach half is delegated to checkRuleViolations so
 * the banner and the insights list can never disagree about what counts as one.
 */

export type StandingLevel = 'clear' | 'approaching' | 'breached';

export interface RuleWarning {
  type: RuleViolation['type'];
  message: string;
}

export interface RuleStanding {
  level: StandingLevel;
  breaches: RuleViolation[];
  warnings: RuleWarning[];
  dayPnl: number;
  tradeCount: number;
}

/**
 * How close to a limit counts as close.
 *
 * Four fifths, not nine tenths. A warning that arrives at 95% of a daily stop is a warning about a
 * trade already placed; at 80% there is usually one decision left to make with it.
 */
export const APPROACHING_FRACTION = 0.8;

/**
 * Today's standing, or null when the trader has not turned rules on.
 *
 * Null rather than a cleared standing, so the caller renders nothing at all: a green "no breaches"
 * banner for somebody who never set a limit is a notification about a feature they declined.
 */
export function ruleStandingToday(
  trades: Trade[],
  rules: TradingRules,
  today: string,
): RuleStanding | null {
  if (!rules.enabled) return null;

  // Ordered, not filtered: the streak rule is about the sequence, so it must see the same
  // order the violations list and the simulator do.
  const dayTrades = tradesByDay(trades).get(today) ?? [];
  if (dayTrades.length === 0) return null;

  const dayPnl = dayTrades.reduce((sum, t) => sum + effectivePnl(t), 0);
  const breaches = checkRuleViolations(dayTrades, rules);
  const breached = new Set(breaches.map((b) => b.type));
  const warnings: RuleWarning[] = [];

  /* Each warning is suppressed once its own limit is broken — not once any limit is. Somebody who
     has blown the loss cap and is also one trade from the trade cap still needs to hear the
     second sentence, and it is the one that names the next action. */

  if (rules.maxTradesPerDay != null && !breached.has('max_trades')) {
    const remaining = rules.maxTradesPerDay - dayTrades.length;
    if (remaining === 0) {
      warnings.push({
        type: 'max_trades',
        message: `That is trade ${dayTrades.length} of ${rules.maxTradesPerDay}. The next one breaks your own limit.`,
      });
    } else if (remaining === 1) {
      warnings.push({
        type: 'max_trades',
        message: `One trade left before your daily cap of ${rules.maxTradesPerDay}.`,
      });
    }
  }

  if (rules.maxDailyLoss != null && !breached.has('max_loss')) {
    const limit = Math.abs(rules.maxDailyLoss);
    if (limit > 0 && dayPnl <= -limit * APPROACHING_FRACTION) {
      warnings.push({
        type: 'max_loss',
        message: `You are ${Math.round((Math.abs(dayPnl) / limit) * 100)}% of the way to your daily stop.`,
      });
    }
  }

  if (rules.maxDailyGain != null && !breached.has('max_gain')) {
    const limit = Math.abs(rules.maxDailyGain);
    if (limit > 0 && dayPnl >= limit * APPROACHING_FRACTION) {
      warnings.push({
        type: 'max_gain',
        message: `You are ${Math.round((dayPnl / limit) * 100)}% of the way to the day's target — the point you said you would stop.`,
      });
    }
  }

  /*
   * The streak warning has no "approaching" fraction — it counts.
   *
   * Four fifths of three losses is not a number, and the useful sentence here is the exact one:
   * you are on your third of three. That is also the moment it can still change a decision, which
   * is the whole reason warnings exist separately from breaches.
   */
  if (rules.maxConsecutiveLosses != null && rules.maxConsecutiveLosses > 0 && !breached.has('max_streak')) {
    const streak = longestLosingStreak(dayTrades);
    if (streak === rules.maxConsecutiveLosses) {
      warnings.push({
        type: 'max_streak',
        message: `That is ${streak} ${streak === 1 ? 'loss' : 'losses'} in a row — the point you said you would stop.`,
      });
    } else if (streak === rules.maxConsecutiveLosses - 1) {
      warnings.push({
        type: 'max_streak',
        message: `${streak} in a row. One more and you are past your own limit.`,
      });
    }
  }

  return {
    level: breaches.length > 0 ? 'breached' : warnings.length > 0 ? 'approaching' : 'clear',
    breaches,
    warnings,
    dayPnl,
    tradeCount: dayTrades.length,
  };
}
