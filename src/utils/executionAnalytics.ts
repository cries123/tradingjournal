import type { Trade, TradeGrade } from '../types';
import { effectivePnl, tradeTags } from './tradeHelpers';

/**
 * The analytics for data the journal was already collecting and never showing.
 *
 * entryTime, rMultiple, mae, mfe, grade and checklistScore have been on the Trade type — and in
 * the trade form — the whole time, with nothing anywhere that reads them back. People were typing
 * a stop distance and a grade into a void.
 *
 * Every function here returns null when it doesn't have enough to say something true. That is the
 * point rather than a detail: the Timing and Execution panels were pulled from the dashboard
 * because they rendered an empty card for anyone who imported from a broker, and a panel that
 * shows nothing is worse than no panel. So coverage is measured first and the caller renders only
 * what cleared it.
 */

/** Below this, a "pattern" is noise and the honest answer is to show nothing. */
export const MIN_SAMPLE = 5;

function net(trades: Trade[]): number {
  return trades.reduce((sum, t) => sum + effectivePnl(t), 0);
}

function winRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  return (trades.filter((t) => effectivePnl(t) > 0).length / trades.length) * 100;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/* ------------------------------------------------------------------ time of day */

export interface HourRow {
  /** 0–23, in whatever timezone the entry time was recorded in (Eastern, for broker imports). */
  hour: number;
  label: string;
  pnl: number;
  trades: number;
  winRate: number;
}

export interface HourlyBreakdown {
  rows: HourRow[];
  best: HourRow;
  worst: HourRow;
  covered: number;
}

/** "09:34" -> 9. Rejects anything that isn't a plausible 24-hour clock time. */
export function parseHour(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

/**
 * P&L by hour of the day the trade was entered.
 *
 * Only the hours actually traded get a row — a day trader's 9am–4pm shouldn't be padded with
 * sixteen empty bars to prove they were asleep. The best and worst hours come back alongside
 * because "you are profitable until 11am" is the sentence this exists to produce, and finding it
 * by eye across eight bars is exactly the work worth doing for someone.
 */
export function hourlyBreakdown(trades: Trade[]): HourlyBreakdown | null {
  const byHour = new Map<number, Trade[]>();

  for (const t of trades) {
    const hour = parseHour(t.entryTime);
    if (hour === null) continue;
    const list = byHour.get(hour) ?? [];
    list.push(t);
    byHour.set(hour, list);
  }

  const covered = [...byHour.values()].reduce((sum, xs) => sum + xs.length, 0);
  if (covered < MIN_SAMPLE) return null;

  const hours = [...byHour.keys()].sort((a, b) => a - b);
  const rows: HourRow[] = [];

  // Fill the gaps BETWEEN traded hours but not outside them: an hour you sat out in the middle of
  // your session is a real and readable gap, and dropping it would compress the axis into a lie.
  for (let hour = hours[0]; hour <= hours[hours.length - 1]; hour++) {
    const xs = byHour.get(hour) ?? [];
    rows.push({
      hour,
      label: hourLabel(hour),
      pnl: net(xs),
      trades: xs.length,
      winRate: winRate(xs),
    });
  }

  const traded = rows.filter((r) => r.trades > 0);
  const best = traded.reduce((a, b) => (b.pnl > a.pnl ? b : a));
  const worst = traded.reduce((a, b) => (b.pnl < a.pnl ? b : a));

  return { rows, best, worst, covered };
}

/* ------------------------------------------------------------------ R-multiple */

export interface ExpectancyStats {
  /** Average R per trade — the number that says whether the edge is real. */
  expectancy: number;
  avgWinR: number;
  avgLossR: number;
  winRate: number;
  bestR: number;
  worstR: number;
  covered: number;
}

/**
 * Expectancy in R, over trades that recorded a risk multiple.
 *
 * R is what makes two traders' results comparable, and what turns "54% win rate" — a number that
 * on its own says nothing about whether someone is making money — into "+0.4R per trade", which
 * says everything.
 */
export function expectancyStats(trades: Trade[]): ExpectancyStats | null {
  const rs = trades
    .map((t) => t.rMultiple)
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r));

  if (rs.length < MIN_SAMPLE) return null;

  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);

  return {
    expectancy: mean(rs),
    avgWinR: mean(wins),
    avgLossR: mean(losses),
    winRate: (wins.length / rs.length) * 100,
    bestR: Math.max(...rs),
    worstR: Math.min(...rs),
    covered: rs.length,
  };
}

/* ------------------------------------------------------------------ excursions */

export interface ExcursionStats {
  /** How far winners went against you before working. The case for a wider stop. */
  avgMaeWinners: number;
  /** How far losers went against you. */
  avgMaeLosers: number;
  /** How far winners ran before you closed. The case for a later exit. */
  avgMfeWinners: number;
  /** How far losers went IN YOUR FAVOUR before turning — money that was there and wasn't taken. */
  avgMfeLosers: number;
  coveredMae: number;
  coveredMfe: number;
}

/**
 * Maximum adverse and favourable excursion, split by how the trade ended.
 *
 * The pairing is the whole value. Winners that routinely dip further than your stop allows means
 * the stop is costing you trades that would have worked; losers that ran well into profit first
 * means the exit, not the entry, is what's broken. Neither is visible from P&L alone.
 */
export function excursionStats(trades: Trade[]): ExcursionStats | null {
  const withMae = trades.filter((t) => typeof t.mae === 'number' && Number.isFinite(t.mae));
  const withMfe = trades.filter((t) => typeof t.mfe === 'number' && Number.isFinite(t.mfe));

  if (withMae.length < MIN_SAMPLE && withMfe.length < MIN_SAMPLE) return null;

  const won = (t: Trade) => effectivePnl(t) > 0;
  // MAE and MFE are magnitudes; a journal that records adverse excursion as a negative number is
  // saying the same thing, so both are normalised rather than trusted to agree.
  const abs = (xs: Trade[], pick: (t: Trade) => number | undefined) =>
    xs.map((t) => Math.abs(pick(t) ?? 0));

  return {
    avgMaeWinners: mean(abs(withMae.filter(won), (t) => t.mae)),
    avgMaeLosers: mean(abs(withMae.filter((t) => !won(t)), (t) => t.mae)),
    avgMfeWinners: mean(abs(withMfe.filter(won), (t) => t.mfe)),
    avgMfeLosers: mean(abs(withMfe.filter((t) => !won(t)), (t) => t.mfe)),
    coveredMae: withMae.length,
    coveredMfe: withMfe.length,
  };
}

/* ------------------------------------------------------------------ discipline */

export interface GradeRow {
  grade: TradeGrade;
  pnl: number;
  trades: number;
  winRate: number;
}

export interface DisciplineStats {
  grades: GradeRow[];
  /** Net per trade when the checklist was mostly followed (>= 80) vs mostly not (< 80). */
  followedPerTrade: number | null;
  ignoredPerTrade: number | null;
  followedCount: number;
  ignoredCount: number;
  coveredGrades: number;
}

const GRADES: TradeGrade[] = ['A', 'B', 'C', 'D', 'F'];

/** Where the checklist stops being a suggestion. Above it, they followed their own plan. */
const ADHERENCE_THRESHOLD = 80;

/**
 * Does following your own rules actually pay?
 *
 * The hardest question in trading to answer honestly, and this journal already holds both columns
 * needed for it — a self-assigned grade and a checklist score — without ever putting them beside
 * the P&L. An A-graded trade that loses money is not a problem; a month where the C trades earn
 * more than the A trades is the finding worth paying for.
 */
export function disciplineStats(trades: Trade[]): DisciplineStats | null {
  const graded = trades.filter((t) => t.grade && GRADES.includes(t.grade));
  const scored = trades.filter(
    (t) => typeof t.checklistScore === 'number' && Number.isFinite(t.checklistScore),
  );

  if (graded.length < MIN_SAMPLE && scored.length < MIN_SAMPLE) return null;

  const grades = GRADES.map((grade) => {
    const xs = graded.filter((t) => t.grade === grade);
    return { grade, pnl: net(xs), trades: xs.length, winRate: winRate(xs) };
  }).filter((row) => row.trades > 0);

  const followed = scored.filter((t) => (t.checklistScore ?? 0) >= ADHERENCE_THRESHOLD);
  const ignored = scored.filter((t) => (t.checklistScore ?? 0) < ADHERENCE_THRESHOLD);

  return {
    grades,
    followedPerTrade: followed.length ? net(followed) / followed.length : null,
    ignoredPerTrade: ignored.length ? net(ignored) / ignored.length : null,
    followedCount: followed.length,
    ignoredCount: ignored.length,
    coveredGrades: graded.length,
  };
}

/* ------------------------------------------------------------------ setups */

export interface TagRow {
  tag: string;
  pnl: number;
  trades: number;
  winRate: number;
  perTrade: number;
}

/**
 * Which of their tagged setups actually makes money.
 *
 * Sorted by total P&L rather than by win rate, because a setup that wins 70% of the time and loses
 * money is the single most valuable thing a journal can tell someone, and sorting by win rate
 * would bury it at the top looking like a success.
 *
 * A tag needs its own small sample before it earns a row — one lucky trade under a new label is
 * not a strategy, and showing it as one is how a journal talks somebody into a bad habit.
 */
export function tagPerformance(trades: Trade[], minPerTag = 3, limit = 8): TagRow[] {
  const byTag = new Map<string, Trade[]>();

  for (const t of trades) {
    for (const tag of tradeTags(t)) {
      const list = byTag.get(tag) ?? [];
      list.push(t);
      byTag.set(tag, list);
    }
  }

  return [...byTag.entries()]
    .filter(([, xs]) => xs.length >= minPerTag)
    .map(([tag, xs]) => ({
      tag,
      pnl: net(xs),
      trades: xs.length,
      winRate: winRate(xs),
      perTrade: net(xs) / xs.length,
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ coverage */

export interface ExecutionCoverage {
  hourly: HourlyBreakdown | null;
  expectancy: ExpectancyStats | null;
  excursions: ExcursionStats | null;
  discipline: DisciplineStats | null;
  tags: TagRow[];
}

/** Everything at once, so a caller can ask "is there anything to show?" with one call. */
export function executionCoverage(trades: Trade[]): ExecutionCoverage {
  return {
    hourly: hourlyBreakdown(trades),
    expectancy: expectancyStats(trades),
    excursions: excursionStats(trades),
    discipline: disciplineStats(trades),
    tags: tagPerformance(trades),
  };
}

export function hasAnyExecutionData(coverage: ExecutionCoverage): boolean {
  return Boolean(
    coverage.hourly ||
      coverage.expectancy ||
      coverage.excursions ||
      coverage.discipline ||
      coverage.tags.length > 0,
  );
}
