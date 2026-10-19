import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { effectivePnl } from './tradeHelpers';
import { APPROACHING_FRACTION } from './ruleStanding';

/**
 * Today against the trader's own limits, as three gauges: trades used of the cap, loss room left
 * before the daily stop, and losers in a row against the streak rule.
 *
 * The rule banner says something only when a limit is near or broken. This is the steady view of
 * the same rules — where the day stands with each one — so the trader reads it before the next
 * trade rather than after the last. Same day order as checkRuleViolations (tradesByDay), so the
 * streak here is the streak the rule judges.
 */
export type MeterState = 'ok' | 'near' | 'at' | 'over';

export interface Meter {
  /** How much of the limit is used, 0–1 (capped at 1 for drawing). */
  used: number;
  state: MeterState;
}

export interface TodayMeters {
  tradeCount: number;
  dayPnl: number;
  trades?: Meter & { count: number; limit: number };
  loss?: Meter & { left: number; limit: number };
  streak?: Meter & { current: number; limit: number };
}

function stateOf(value: number, limit: number): MeterState {
  if (value > limit) return 'over';
  if (value === limit) return 'at';
  if (value >= limit * APPROACHING_FRACTION) return 'near';
  return 'ok';
}

/**
 * Losers back to back at the end of the day so far — the run the next trade would extend.
 *
 * A scratch neither extends the run nor ends it, exactly as longestLosingStreak counts it, so the
 * gauge reads "3 of 3" on the same trade the rule would call the third.
 */
export function trailingLosers(dayTrades: readonly Trade[]): number {
  let run = 0;
  for (let i = dayTrades.length - 1; i >= 0; i--) {
    const pnl = effectivePnl(dayTrades[i]);
    if (pnl < 0) run++;
    else if (pnl > 0) break;
  }
  return run;
}

/** `dayTrades` in the day's order, as tradesByDay returns them. */
export function todayMeters(dayTrades: readonly Trade[], rules: TradingRules): TodayMeters {
  const dayPnl = dayTrades.reduce((sum, t) => sum + effectivePnl(t), 0);
  const out: TodayMeters = { tradeCount: dayTrades.length, dayPnl };

  if (rules.maxTradesPerDay != null && rules.maxTradesPerDay > 0) {
    const limit = rules.maxTradesPerDay;
    out.trades = { count: dayTrades.length, limit, used: Math.min(1, dayTrades.length / limit), state: stateOf(dayTrades.length, limit) };
  }

  if (rules.maxDailyLoss != null && rules.maxDailyLoss > 0) {
    const limit = Math.abs(rules.maxDailyLoss);
    const lost = Math.max(0, -dayPnl);
    // The rule breaks AT the limit (dayPnl <= -limit in checkRuleViolations), so reaching it is over.
    const state: MeterState = lost >= limit ? 'over' : lost >= limit * APPROACHING_FRACTION ? 'near' : 'ok';
    out.loss = { left: Math.max(0, limit - lost), limit, used: Math.min(1, lost / limit), state };
  }

  if (rules.maxConsecutiveLosses != null && rules.maxConsecutiveLosses > 0) {
    const limit = rules.maxConsecutiveLosses;
    const current = trailingLosers(dayTrades);
    out.streak = { current, limit, used: Math.min(1, current / limit), state: stateOf(current, limit) };
  }

  return out;
}
