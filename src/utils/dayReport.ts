import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { effectivePnl } from './tradeHelpers';
import { longestLosingStreak } from './tradingRules';

/**
 * One day, read the way the trader's own rules read it.
 *
 * Every function here takes the day's trades IN ORDER, as tradesByDay returns them, so "the 4th
 * trade" on the day page is the trade the rule called the 4th. The broken/kept verdicts are the
 * same tests checkRuleViolations makes (dayReport.test.ts holds them to it); what this adds is the
 * when — which trade crossed the line — because "you broke your cap" with no trade named is a
 * verdict the trader cannot check against the list right below it.
 */

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export interface DayPoint {
  /** 1-based position in the day. */
  position: number;
  pnl: number;
  /** The day's total after this trade. */
  running: number;
  trade: Trade;
}

export function runningTotals(dayTrades: readonly Trade[]): DayPoint[] {
  let running = 0;
  return dayTrades.map((trade, i) => {
    const pnl = effectivePnl(trade);
    running += pnl;
    return { position: i + 1, pnl, running, trade };
  });
}

export type DayRuleType = 'max_trades' | 'max_loss' | 'max_streak' | 'max_gain';

export interface DayRuleLine {
  type: DayRuleType;
  /** The rule as the trader set it: "Max 3 trades a day". */
  label: string;
  broken: boolean;
  /** What the day did against it: "Took 6. Past it from the 4th trade." */
  detail: string;
}

/** Each rule the trader has on, judged against this one day. Empty when rules are off. */
export function dayRuleLines(dayTrades: readonly Trade[], rules: TradingRules, fmt: (n: number) => string): DayRuleLine[] {
  if (!rules.enabled) return [];
  const points = runningTotals(dayTrades);
  const dayPnl = points.at(-1)?.running ?? 0;
  const lines: DayRuleLine[] = [];

  if (rules.maxTradesPerDay != null) {
    const cap = rules.maxTradesPerDay;
    const broken = dayTrades.length > cap;
    lines.push({
      type: 'max_trades',
      label: `Max ${cap} trade${cap === 1 ? '' : 's'} a day`,
      broken,
      detail: broken ? `Took ${dayTrades.length}. Past it from the ${ordinal(cap + 1)} trade.` : `${dayTrades.length} of ${cap}.`,
    });
  }

  if (rules.maxDailyLoss != null) {
    const limit = Math.abs(rules.maxDailyLoss);
    // The same test as checkRuleViolations: the day's total at or below the limit.
    const broken = dayPnl <= -limit;
    const crossed = points.find((p) => p.running <= -limit);
    const low = Math.min(0, ...points.map((p) => p.running));
    lines.push({
      type: 'max_loss',
      label: `Stop at ${fmt(-limit)} on the day`,
      broken,
      detail: broken
        ? `Finished at ${fmt(dayPnl)}${crossed ? `, past it on the ${ordinal(crossed.position)} trade` : ''}.`
        : crossed
          ? // Crossed during the day and recovered: not a breach by the rule, but worth saying.
            `Went to ${fmt(low)} on the ${ordinal(crossed.position)} trade, then finished at ${fmt(dayPnl)}.`
          : low < 0
            ? `Lowest point ${fmt(low)}.`
            : 'Never below zero.',
    });
  }

  if (rules.maxConsecutiveLosses != null && rules.maxConsecutiveLosses > 0) {
    const limit = rules.maxConsecutiveLosses;
    const longest = longestLosingStreak([...dayTrades]);
    const broken = longest > limit;
    lines.push({
      type: 'max_streak',
      label: `Stop after ${limit} loser${limit === 1 ? '' : 's'} in a row`,
      broken,
      detail: broken ? `${longest} losers in a row.` : longest === 0 ? 'No losing trades.' : `Never more than ${longest} in a row.`,
    });
  }

  if (rules.maxDailyGain != null) {
    const gain = rules.maxDailyGain;
    const broken = dayPnl >= gain;
    lines.push({
      type: 'max_gain',
      label: `Stop once up ${fmt(gain)}`,
      broken,
      detail: broken ? `Finished up ${fmt(dayPnl)}.` : `Finished at ${fmt(dayPnl)}.`,
    });
  }

  return lines;
}

export interface CapReport {
  cap: number;
  /** The day's total if it had ended at the cap. */
  kept: number;
  /** The day's actual total. */
  actual: number;
  /** What the trades after the cap added up to (negative when they cost money). */
  after: number;
  afterCount: number;
}

/**
 * The day had it stopped at the cap — the rule simulator's question, asked of one day.
 *
 * Null when the day stayed inside the cap: there is no "if" to report.
 */
export function capReport(dayTrades: readonly Trade[], cap: number | undefined): CapReport | null {
  if (cap == null || cap <= 0 || dayTrades.length <= cap) return null;
  const points = runningTotals(dayTrades);
  const kept = points[cap - 1].running;
  const actual = points.at(-1)!.running;
  return { cap, kept, actual, after: actual - kept, afterCount: dayTrades.length - cap };
}
