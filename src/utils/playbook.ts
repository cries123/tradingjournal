import type { ChecklistTick, Trade } from '../types';
import type { Strategy } from '../types/strategy';
import { effectivePnl } from './tradeHelpers';

/**
 * The playbook: each strategy's own rules, ticked trade by trade.
 *
 * Strategy.criteria was declared from the start and written as [] everywhere, and checklistScore
 * was a percentage somebody typed into a box — so the Discipline panel, which exists to answer
 * "does following my plan make money", was scoring a number nobody computed. Here the rules are
 * real, the score is counted from ticks, and the analysis can go one level further than a single
 * percentage: which rule, when skipped, costs this trader money.
 */

export type { ChecklistTick };

/**
 * Twelve rules is already a long pre-trade checklist; past that nobody ticks honestly, and the
 * trade form turns into a wall of boxes on a phone.
 */
export const MAX_RULES_PER_STRATEGY = 12;

/** Long enough for "Waited for the 5-minute candle to close above VWAP", short enough to fit a row. */
export const MAX_RULE_LENGTH = 120;

/** Rules as they may be stored: trimmed, non-empty, no case-insensitive duplicates, capped. */
export function cleanRules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const rule = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_RULE_LENGTH);
    const key = rule.toLowerCase();
    if (!rule || seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
    if (out.length >= MAX_RULES_PER_STRATEGY) break;
  }
  return out;
}

/** A stored checklist, believed only as far as its shape. */
export function readChecklist(input: unknown): ChecklistTick[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (t): t is ChecklistTick =>
        Boolean(t) && typeof (t as ChecklistTick).rule === 'string' && typeof (t as ChecklistTick).met === 'boolean',
    )
    .map((t) => ({ rule: t.rule, met: t.met }));
}

/**
 * The boxes to show for a trade under a strategy.
 *
 * A trade that was already ticked against this strategy keeps the rules it was ticked against,
 * even if the playbook has changed since. That is the record: the trade was taken under that
 * checklist, and rewriting it to today's rules would put ticks against rules that did not exist
 * when the trade was made. Any other trade — new, never ticked, or moved to a different strategy —
 * gets the strategy's current rules, all unticked.
 */
export function ticksFor(
  strategy: Strategy | undefined,
  trade: Pick<Trade, 'strategyId' | 'checklist'> | undefined,
): ChecklistTick[] {
  if (!strategy) return [];
  const existing = readChecklist(trade?.checklist);
  if (existing.length > 0 && trade?.strategyId === strategy.id) return existing;
  return cleanRules(strategy.criteria).map((rule) => ({ rule, met: false }));
}

/** The 0–100 score the Discipline panel reads, counted rather than typed. Undefined with no rules. */
export function checklistScoreOf(ticks: ChecklistTick[]): number | undefined {
  if (ticks.length === 0) return undefined;
  return Math.round((ticks.filter((t) => t.met).length / ticks.length) * 100);
}

/**
 * How many trades a rule needs on EACH side — followed and skipped — before it gets a row.
 *
 * Three, not the five the rest of the screen uses, because this is a split of a split: a rule
 * skipped five times is already a habit worth seeing, and at five per side most traders would
 * never see a row at all. The row says how many trades sit behind each number, so a thin one
 * reads as thin.
 */
export const MIN_PER_RULE_SIDE = 3;

export interface RuleRow {
  rule: string;
  followed: number;
  skipped: number;
  followedPerTrade: number;
  skippedPerTrade: number;
  /** Per trade, what skipping this rule cost: followed minus skipped. Negative means skipping paid. */
  costOfSkipping: number;
}

/**
 * Rule by rule: net per trade when it was followed, against when it was skipped.
 *
 * Matched on the rule's text, case-insensitively, so the same rule under two strategies — "size
 * within plan" is in most people's every checklist — is one row with all its trades behind it.
 * Sorted by what skipping costs, most expensive first: the rule at the top is the one to stop
 * breaking. A rule that pays to skip sorts to the bottom and says so, which is a finding too.
 */
export function ruleByRule(trades: Trade[], minPerSide = MIN_PER_RULE_SIDE): RuleRow[] {
  const byRule = new Map<string, { rule: string; followed: number[]; skipped: number[] }>();

  for (const trade of trades) {
    for (const tick of readChecklist(trade.checklist)) {
      const key = tick.rule.trim().toLowerCase();
      if (!key) continue;
      const row = byRule.get(key) ?? { rule: tick.rule.trim(), followed: [], skipped: [] };
      (tick.met ? row.followed : row.skipped).push(effectivePnl(trade));
      byRule.set(key, row);
    }
  }

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

  return [...byRule.values()]
    .filter((r) => r.followed.length >= minPerSide && r.skipped.length >= minPerSide)
    .map((r) => {
      const followedPerTrade = mean(r.followed);
      const skippedPerTrade = mean(r.skipped);
      return {
        rule: r.rule,
        followed: r.followed.length,
        skipped: r.skipped.length,
        followedPerTrade,
        skippedPerTrade,
        costOfSkipping: followedPerTrade - skippedPerTrade,
      };
    })
    .sort((a, b) => b.costOfSkipping - a.costOfSkipping);
}
