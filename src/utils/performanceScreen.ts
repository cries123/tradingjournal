import type { Filters, Trade } from '../types';
import { brokerCoverage, type BrokerCoverage } from './brokerAnalytics';
import { formatMonthYear } from './format';
import { collectFindings, performanceVerdict, type Finding } from './performanceVerdict';
import { simulateRules } from './ruleSimulator';
import { effectivePnl, tradeTags } from './tradeHelpers';

/**
 * The Performance screen's own words and figures, kept out of the components so a test can read
 * every sentence the screen says and check it against the analytics it came from.
 *
 * Nothing here computes a finding of its own. The verdict is performanceVerdict's, the cap figures
 * are the rule simulator's, the drawdown walks the same days maxDrawdownByDay does. This file only
 * decides how the screen says them — which is where the approved redesign changed most: a figure in
 * large type with a short sentence about what it is, instead of a sentence with the figure inside it.
 */

export type Scope = 'month' | 'year' | 'all';
export type Tone = 'profit' | 'loss' | 'neutral';

/** A sentence with its figures marked, so the screen can color them and a test can read it whole. */
export type Part = string | { text: string; tone: Tone };

export type Fmt = (n: number) => string;

export function partsText(parts: readonly Part[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');
}

/** "+$705.33" — P&L on this screen always carries its sign, as the mockups draw it. */
export function signed(n: number, fmt: Fmt): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

/** "$5,689" — the list's figures, where cents are noise next to a name. */
export function whole(n: number, fmt: Fmt): string {
  return fmt(Math.round(n)).replace(/\.00$/, '');
}

export function signedWhole(n: number, fmt: Fmt): string {
  const rounded = Math.round(n);
  return rounded > 0 ? `+${whole(rounded, fmt)}` : whole(rounded, fmt);
}

export function toneOf(n: number): Tone {
  return n > 0 ? 'profit' : n < 0 ? 'loss' : 'neutral';
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const ORDINAL_WORDS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];

/** "three" up to ten, digits after — "Stop after three", "Cap the day at 14". */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export function ordinalWord(n: number): string {
  if (ORDINAL_WORDS[n]) return ORDINAL_WORDS[n];
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/* ------------------------------------------------------------------ the period */

export interface PeriodWords {
  /** As a thing: "this year", "2025", "September 2025", "your whole journal". */
  noun: string;
  /** As when: "this year", "in 2025", "in September 2025", "across your whole journal". */
  during: string;
}

/**
 * The period as the sentences need it.
 *
 * The mockup's callout says "would have turned this year into"; said of last year that is wrong,
 * and said of a month it is wrong twice. `now` is passed in rather than read here so the screen can
 * take it once (react-hooks/purity) and a test can pin it.
 */
export function periodWords(scope: Scope, year: number, month: number, now: { year: number; month: number }): PeriodWords {
  if (scope === 'all') return { noun: 'your whole journal', during: 'across your whole journal' };
  if (scope === 'year') {
    return year === now.year ? { noun: 'this year', during: 'this year' } : { noun: String(year), during: `in ${year}` };
  }
  if (year === now.year && month === now.month) return { noun: 'this month', during: 'this month' };
  const label = formatMonthYear(year, month);
  return { noun: label, during: `in ${label}` };
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ------------------------------------------------------------------ filters */

/**
 * The toolbar filter, the same four rules useTrades applies to the Overview.
 *
 * A copy rather than an import because the hook keeps its predicate inline, and this screen filters
 * its own period rather than the dashboard's — its filter is local, so choosing a symbol here does
 * not quietly narrow the Overview the trader goes back to.
 */
export function matchesFilters(trade: Trade, filters: Filters): boolean {
  if (filters.symbol && trade.symbol !== filters.symbol) return false;
  if (filters.setup && trade.setup !== filters.setup) return false;
  if (filters.side && trade.side !== filters.side) return false;
  if (filters.tag && !tradeTags(trade).includes(filters.tag)) return false;
  return true;
}

/* ------------------------------------------------------------------ drawdown */

export interface Drawdown {
  /** The deepest fall from a high, as a positive number. 0 when the period never gave anything back. */
  depth: number;
  /** The day of the high it fell from, or null when the fall is from where the period started. */
  peakDate: string | null;
}

/**
 * Max drawdown by day, and the day of the high it was measured from.
 *
 * The same walk as maxDrawdownByDay (trackRecord.ts) — whole days, net of fees, starting from zero —
 * so the figure here is the figure the track record publishes. It is a second walk only because
 * the KPI strip says where the fall started ("from the March high"), which that function does not
 * keep. A test holds the two depths equal.
 */
export function drawdownFromPeak(trades: Trade[]): Drawdown {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    if (!t.date) continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + effectivePnl(t));
  }

  let running = 0;
  let peak = 0;
  let peakDate: string | null = null;
  let depth = 0;
  let depthFrom: string | null = null;
  for (const [date, pnl] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    running += pnl;
    if (running > peak) {
      peak = running;
      peakDate = date;
    }
    if (peak - running > depth) {
      depth = peak - running;
      depthFrom = peakDate;
    }
  }
  return { depth, peakDate: depthFrom };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "from the March high", "from the Sep 12 high", "from the March 2025 high". */
export function drawdownHint(drawdown: Drawdown, scope: Scope): string {
  if (drawdown.depth <= 0) return 'nothing given back';
  if (!drawdown.peakDate) return 'from where the period began';
  const [y, m, d] = drawdown.peakDate.split('-').map(Number);
  const month = MONTHS[(m ?? 1) - 1] ?? '';
  if (scope === 'month') return `from the ${month.slice(0, 3)} ${d} high`;
  if (scope === 'all') return `from the ${month} ${y} high`;
  return `from the ${month} high`;
}

/* ------------------------------------------------------------------ the verdict band */

export interface BandCell {
  pnl: number;
  /** What the figure is: "Your 4th and later trades of the day, across 123 trades." */
  sentence: string;
  /** The desktop's second sentence, when there is one worth saying: "Everything before them made money." */
  context: string | null;
}

export interface BandChange {
  /** The instruction in a few words: "Stop after three". */
  headline: string;
  /** Why, with its figure: "The trades before your fourth made +$1,147.10 this year." */
  detail: Part[];
  /** The phone's one line: "Stop after three — the trades before your fourth made +$1,147.10". */
  phone: Part[];
  /** A daily trade cap the rule simulator can replay, when the change is one. */
  cap: number | null;
}

export interface VerdictBand {
  /** The drain, or the engine for a journal with nothing that lost. */
  primary: BandCell & { kind: 'drain' | 'engine' };
  /** The engine beside the drain. */
  secondary: BandCell | null;
  change: BandChange | null;
}

/** "your 4th+ trades of the day" → "Your 4th and later trades of the day". */
function subjectPhrase(subject: string): string {
  return capitalize(subject.replace(/(\d+(?:st|nd|rd|th))\+/, '$1 and later'));
}

function over(f: Finding): string {
  return `across ${f.count} ${f.count === 1 ? f.unit.slice(0, -1) : f.unit}`;
}

/** The sequence row a finding is about, matched the way performanceVerdict names it. */
function sequenceRow(coverage: BrokerCoverage, f: Finding) {
  return coverage.sequence.find((r) => `your ${r.label} trade${r.label.endsWith('+') ? 's' : ''} of the day` === f.subject);
}

/**
 * What a daily cap of `cap` trades would have made, from the rule simulator itself.
 *
 * Not the sum of the sequence rows before the cap: those drop a position with fewer than three
 * trades, and the Simulate button opens a screen that does not. The figure the band and the callout
 * quote has to be the one the simulator shows a click later.
 */
export function capOutcome(trades: Trade[], cap: number): { simulated: number; actual: number } {
  const result = simulateRules(trades, { enabled: true, maxTradesPerDay: cap });
  return { simulated: result.simulatedPnl, actual: result.actualPnl };
}

/** The ordinal before "4th+": the trade count a cap would allow. Mirrors performanceVerdict. */
function capBeforeLabel(label: string): number | null {
  const n = Number.parseInt(label, 10);
  return Number.isFinite(n) && n > 1 ? n - 1 : null;
}

function changeCopy(trades: Trade[], coverage: BrokerCoverage, findings: Finding[], dimension: Finding['dimension'], fmt: Fmt, period: PeriodWords): BandChange | null {
  const worst = (dim: Finding['dimension']) =>
    findings.filter((f) => f.dimension === dim && f.pnl < 0).sort((a, b) => b.impact - a.impact)[0];

  if (dimension === 'sequence') {
    const f = worst('sequence');
    const row = f ? sequenceRow(coverage, f) : undefined;
    const cap = row ? capBeforeLabel(row.label) : null;
    if (cap === null) return null;
    const { simulated } = capOutcome(trades, cap);
    const headline = cap === 1 ? 'One trade a day' : `Stop after ${numberWord(cap)}`;
    const made: Part[] = simulated >= 0
      ? [' made ', { text: signed(simulated, fmt), tone: toneOf(simulated) }]
      : [' lost ', { text: fmt(Math.abs(simulated)), tone: 'loss' }];
    return {
      headline,
      detail: [`The trades before your ${ordinalWord(cap + 1)}`, ...made, ` ${period.during}.`],
      phone: [`${headline} — the trades before your ${ordinalWord(cap + 1)}`, ...made],
      cap,
    };
  }

  if (dimension === 'load') {
    const f = worst('load');
    const row = f ? coverage.load.find((r) => `days with ${r.label}` === f.subject) : undefined;
    const best = [...coverage.load].sort((a, b) => b.perDay - a.perDay)[0];
    const cap = row ? capBeforeLabel(row.label) : null;
    if (!row || !best || cap === null) return null;
    const headline = `Cap the day at ${numberWord(cap)}`;
    const avg: Part = { text: fmt(row.perDay), tone: toneOf(row.perDay) };
    return {
      headline,
      detail: [`Days with ${row.label} average `, avg, `; days with ${best.label} average `, { text: fmt(best.perDay), tone: toneOf(best.perDay) }, '.'],
      phone: [`${headline} — days with ${row.label} average `, avg],
      cap,
    };
  }

  if (dimension === 'expiry') {
    const f = worst('expiry');
    const best = [...coverage.expiry].sort((a, b) => b.pnl - a.pnl)[0];
    if (!f || !best) return null;
    const label = f.subject.replace(/ contracts$/, '');
    const headline = `Fewer ${label} contracts`;
    const cost: Part = { text: fmt(Math.abs(f.pnl)), tone: 'loss' };
    const bestName = best.label === '0DTE' ? '0DTE contracts' : `contracts with ${best.label} left`;
    return {
      headline,
      detail: ['They cost you ', cost, ` ${period.during}, while ${bestName} made `, { text: fmt(best.pnl), tone: toneOf(best.pnl) }, '.'],
      phone: [`${headline} — they cost you `, cost],
      cap: null,
    };
  }

  if (dimension === 'sizing' && coverage.sizing) {
    const s = coverage.sizing;
    const loses: Part = { text: fmt(Math.abs(s.biggestQuarterPerTrade)), tone: 'loss' };
    return {
      headline: 'Size down',
      detail: ['Your biggest quarter of positions loses ', loses, ` a trade; the rest ${s.restPerTrade >= 0 ? 'make' : 'lose'} ${fmt(Math.abs(s.restPerTrade))} a trade.`],
      phone: ['Size down — your biggest positions lose ', loses, ' a trade'],
      cap: null,
    };
  }

  if (dimension === 'tilt' && coverage.tilt) {
    const t = coverage.tilt;
    const gap: Part = { text: fmt(Math.abs(t.delta)), tone: 'loss' };
    return {
      headline: 'Pause after a loss',
      detail: ['The next trade is worth ', gap, ` less than one taken after a win — ${t.afterLossCount} times over.`],
      phone: ['Pause after a loss — the next trade is worth ', gap, ' less'],
      cap: null,
    };
  }

  return null;
}

/**
 * The three cells under the figures: where the money goes, where it comes from, the one change.
 *
 * Built on performanceVerdict, so the drain named here is the drain the Overview's "What is costing
 * you" names for the same trades. The drain's sentence no longer carries its figure — the figure is
 * the cell's headline — so it says what the figure is about and, for the sequence, whether the rest
 * of the day made money, which is the half of the finding that makes the change worth trying.
 */
export function verdictBand(
  trades: Trade[],
  fmt: Fmt,
  period: PeriodWords,
  coverage: BrokerCoverage = brokerCoverage(trades),
): VerdictBand | null {
  const verdict = performanceVerdict(trades, fmt);
  if (!verdict || (!verdict.drain && !verdict.engine)) return null;

  const cell = (f: Finding, role: 'drain' | 'engine'): BandCell => {
    let context: string | null = null;
    let tail = '';
    if (f.dimension === 'sequence') {
      const row = sequenceRow(coverage, f);
      if (role === 'drain' && row) {
        const cap = capBeforeLabel(row.label);
        if (cap !== null && row.label.endsWith('+') && capOutcome(trades, cap).simulated > 0) {
          context = 'Everything before them made money.';
        }
      }
      if (role === 'engine' && row) {
        const bestPerTrade = coverage.sequence.reduce((a, b) => (b.perTrade > a.perTrade ? b : a));
        if (bestPerTrade.label === row.label) tail = ' — the best spot in your day';
      }
    }
    return { pnl: f.pnl, sentence: `${subjectPhrase(f.subject)}, ${over(f)}${tail}.`, context };
  };

  const primaryFinding = verdict.drain ?? verdict.engine!;
  const kind = verdict.drain ? 'drain' : 'engine';

  /*
   * Every finding, unthresholded. The change performanceVerdict chose is the biggest losing finding
   * of its dimension, which by definition cleared the threshold — so the worst row here is the row
   * its sentence was about, and the headline cannot name a different cap from the verdict.
   */
  const findings = collectFindings(trades, coverage);

  return {
    primary: { ...cell(primaryFinding, kind), kind },
    secondary: verdict.drain && verdict.engine ? cell(verdict.engine, 'engine') : null,
    change: verdict.change ? changeCopy(trades, coverage, findings, verdict.change.dimension, fmt, period) : null,
  };
}
