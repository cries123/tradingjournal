import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';

/**
 * The behavioural half of a trading journal — the part that isn't P&L.
 *
 * Everything here is derived from fields the app already stores and has never shown the assistant:
 * how long positions are held, how the trader graded themselves, whether they followed their own
 * checklist, whether they respected their own limits. A journal that only reports P&L tells a
 * trader what happened; these are the numbers that suggest why.
 *
 * The recurring rule is sample size. Every figure below is reported with the count it came from,
 * and thin samples are returned as null rather than as a confident-looking number, because the
 * model will faithfully explain whatever it is handed — including a "pattern" built from two
 * trades.
 */

/** Under this, a split isn't a finding — it's an anecdote. */
const MIN_SPLIT_SAMPLE = 4;
/** A whole-population statistic can speak a little sooner than a split does. */
const MIN_POPULATION_SAMPLE = 3;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "HH:MM" to minutes since midnight, or null for anything malformed. */
function toMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function holdMinutes(trade: Trade): number | null {
  const start = toMinutes(trade.entryTime);
  const end = toMinutes(trade.exitTime);
  if (start === null || end === null) return null;
  // Times carry no date, so a close that reads earlier than the open is an overnight hold. Those
  // can't be measured from clock times alone and are dropped rather than reported as negative.
  if (end < start) return null;
  return end - start;
}

export interface HoldTimeFacts {
  avgWinnerMinutes: number;
  avgLoserMinutes: number;
  winnerSample: number;
  loserSample: number;
  /** True when losers are held meaningfully longer — cutting winners short, letting losers run. */
  holdsLosersLonger: boolean;
}

/**
 * How long winners are held versus losers.
 *
 * This is the most diagnostic number a journal can produce and the app was throwing it away. A
 * trader who holds losers twice as long as winners has a discipline problem no amount of setup
 * selection will fix, and it is invisible in every P&L statistic.
 */
export function computeHoldTime(trades: Trade[]): HoldTimeFacts | null {
  const winners: number[] = [];
  const losers: number[] = [];

  for (const t of trades) {
    const held = holdMinutes(t);
    if (held === null) continue;
    const pnl = effectivePnl(t);
    if (pnl > 0) winners.push(held);
    else if (pnl < 0) losers.push(held);
  }

  if (winners.length < MIN_SPLIT_SAMPLE || losers.length < MIN_SPLIT_SAMPLE) return null;

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const avgWinnerMinutes = Math.round(mean(winners));
  const avgLoserMinutes = Math.round(mean(losers));

  return {
    avgWinnerMinutes,
    avgLoserMinutes,
    winnerSample: winners.length,
    loserSample: losers.length,
    // 1.3x rather than any difference at all: normal variance shouldn't be dressed up as a habit.
    holdsLosersLonger: avgLoserMinutes > avgWinnerMinutes * 1.3,
  };
}

export interface GradeBucket {
  grade: string;
  trades: number;
  pnl: number;
  winRate: number;
}

export interface SelfAssessmentFacts {
  grades: GradeBucket[];
  /** True when the trader's best-graded trades made less than their worst-graded ones. */
  gradingInverted: boolean;
}

/**
 * What the trader's own grades were worth.
 *
 * Comparing self-assessment against outcome is something only a journal can do, and it's often the
 * most confronting thing in it: a trader whose A-graded trades lose money is misreading the thing
 * they're most confident about.
 */
export function computeSelfAssessment(trades: Trade[]): SelfAssessmentFacts | null {
  const graded = trades.filter((t) => t.grade);
  if (graded.length < MIN_POPULATION_SAMPLE) return null;

  const buckets = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of graded) {
    const key = String(t.grade);
    const b = buckets.get(key) ?? { pnl: 0, trades: 0, wins: 0 };
    const pnl = effectivePnl(t);
    b.pnl += pnl;
    b.trades++;
    if (pnl > 0) b.wins++;
    buckets.set(key, b);
  }

  const grades = [...buckets.entries()]
    .map(([grade, b]) => ({
      grade,
      trades: b.trades,
      pnl: money(b.pnl),
      winRate: pct((b.wins / b.trades) * 100),
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade));

  const best = grades[0];
  const worst = grades[grades.length - 1];
  const gradingInverted =
    grades.length > 1
    && best.trades >= MIN_SPLIT_SAMPLE
    && worst.trades >= MIN_SPLIT_SAMPLE
    && best.pnl < worst.pnl;

  return { grades, gradingInverted };
}

export interface ChecklistFacts {
  followedPnl: number;
  followedTrades: number;
  skippedPnl: number;
  skippedTrades: number;
  threshold: number;
}

/** P&L on trades that followed the trader's checklist versus the ones that didn't. */
export function computeChecklistAdherence(trades: Trade[], threshold = 70): ChecklistFacts | null {
  const scored = trades.filter((t) => typeof t.checklistScore === 'number');
  const followed = scored.filter((t) => (t.checklistScore ?? 0) >= threshold);
  const skipped = scored.filter((t) => (t.checklistScore ?? 0) < threshold);
  if (followed.length < MIN_SPLIT_SAMPLE || skipped.length < MIN_SPLIT_SAMPLE) return null;

  const sum = (xs: Trade[]) => xs.reduce((s, t) => s + effectivePnl(t), 0);
  return {
    followedPnl: money(sum(followed)),
    followedTrades: followed.length,
    skippedPnl: money(sum(skipped)),
    skippedTrades: skipped.length,
    threshold,
  };
}

export interface DirectionFacts {
  long: { pnl: number; trades: number; winRate: number };
  short: { pnl: number; trades: number; winRate: number };
}

/** Long versus short, when the trader does enough of both for the comparison to mean anything. */
export function computeDirectionSplit(trades: Trade[]): DirectionFacts | null {
  const bucket = (side: 'long' | 'short') => {
    const xs = trades.filter((t) => t.side === side);
    const wins = xs.filter((t) => effectivePnl(t) > 0).length;
    return {
      pnl: money(xs.reduce((s, t) => s + effectivePnl(t), 0)),
      trades: xs.length,
      winRate: xs.length ? pct((wins / xs.length) * 100) : 0,
    };
  };
  const long = bucket('long');
  const short = bucket('short');
  if (long.trades < MIN_SPLIT_SAMPLE || short.trades < MIN_SPLIT_SAMPLE) return null;
  return { long, short };
}

export interface WeekdayFact {
  day: string;
  pnl: number;
  trades: number;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** P&L by day of the week. Parsed as a plain date so a timezone can't shift a trade to Sunday. */
export function computeWeekdaySplit(trades: Trade[]): WeekdayFact[] | null {
  const buckets = new Map<number, { pnl: number; trades: number }>();

  for (const t of trades) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t.date);
    if (!m) continue;
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
    const b = buckets.get(day) ?? { pnl: 0, trades: 0 };
    b.pnl += effectivePnl(t);
    b.trades++;
    buckets.set(day, b);
  }

  if (buckets.size < 2) return null;

  return [...buckets.entries()]
    .map(([day, b]) => ({ day: WEEKDAYS[day], pnl: money(b.pnl), trades: b.trades }))
    .sort((a, b) => a.pnl - b.pnl);
}

/** Total commissions and fees. Rarely aggregated anywhere a trader actually looks. */
export function computeFees(trades: Trade[]): { total: number; trades: number } | null {
  const withFees = trades.filter((t) => typeof t.fees === 'number' && t.fees !== 0);
  if (withFees.length === 0) return null;
  return {
    total: money(withFees.reduce((s, t) => s + Math.abs(t.fees ?? 0), 0)),
    trades: withFees.length,
  };
}
