import type { Trade } from '../types';
import {
  brokerCoverage,
  MIN_SAMPLE,
  type BrokerCoverage,
} from './brokerAnalytics';
import { symbolPerformance } from './executionAnalytics';
import { effectivePnl } from './tradeHelpers';

/**
 * The Performance screen's verdict: what the whole page says, in three lines, before the panels.
 *
 * Every panel on the screen ends in a sentence of its own, and nothing joined them. A trader read
 * "0DTE cost you $5,530", then "your 4th+ trades cost you $4,283", then "your biggest quarter
 * loses $30 a trade", and had to work out for themselves that those are the same leak seen three
 * ways and that everything else they do makes money. This does that work: the biggest drain, the
 * biggest engine, and the one change worth making, each sized in dollars so the reader knows which
 * of the twelve sentences below matters.
 *
 * Dollar impact, not win rate, decides the order. A 40% win rate on a $20 bucket is a curiosity; a
 * 45% win rate on a $19,000 bucket is the year. The dimensions overlap (most 0DTE trades are also
 * SPY trades and also 4th-of-the-day trades), so the figures are never summed, only ranked.
 *
 * Pure, and takes the formatter as an argument, like computeTakeaway: the sentences are the
 * product, so they are built here where a test can read them.
 */

export type Dimension = 'sequence' | 'load' | 'expiry' | 'instrument' | 'symbol' | 'sizing' | 'tilt';

export interface Finding {
  dimension: Dimension;
  /** What the money was lost or made on: "0DTE contracts", "your 4th+ trades of the day", "CVX". */
  subject: string;
  /** Net P&L of the group, signed. */
  pnl: number;
  /** How many trades (or, for the load dimension, days) the figure is spread over. */
  count: number;
  /** "trades" or "days" — what `count` counts. */
  unit: 'trades' | 'days';
  /** |pnl|, for ranking. */
  impact: number;
}

export interface Change {
  dimension: Dimension;
  /** The instruction, as a sentence. */
  text: string;
  impact: number;
}

export interface PerformanceVerdict {
  /** The group that cost the most, or null for a journal with nothing that lost. */
  drain: Finding | null;
  /** The group that made the most. */
  engine: Finding | null;
  /** The behavioural change worth the most, when one of the behavioural dimensions is the problem. */
  change: Change | null;
  /** Sentences for each, built with the caller's formatter. */
  lines: { drain: string | null; engine: string | null };
  net: number;
  trades: number;
}

/**
 * Below this a group is not worth a headline. Two percent of everything that changed hands, with
 * a dollar floor so a journal of $5 scalps still gets a verdict about its $200 problem rather than
 * about nothing. Deliberately low: the gates in brokerAnalytics already decide what is a pattern,
 * and this only decides what leads.
 */
const MIN_SHARE_OF_TURNOVER = 0.02;
const MIN_IMPACT = 50;

function minImpact(trades: Trade[]): number {
  const turnover = trades.reduce((sum, t) => sum + Math.abs(effectivePnl(t)), 0);
  return Math.max(MIN_IMPACT, turnover * MIN_SHARE_OF_TURNOVER);
}

/** The ordinal before "4th+": the trade count a cap would allow. */
function capBefore(label: string): number | null {
  const n = Number.parseInt(label, 10);
  return Number.isFinite(n) && n > 1 ? n - 1 : null;
}

/** "6–10 trades" → 5, the day size a cap would allow. */
function capBelow(label: string): number | null {
  const n = Number.parseInt(label, 10);
  return Number.isFinite(n) && n > 1 ? n - 1 : null;
}

/** Every group the panels know about, as findings, so the ranking has one list to sort. */
export function collectFindings(trades: Trade[], coverage: BrokerCoverage = brokerCoverage(trades)): Finding[] {
  const findings: Finding[] = [];
  const add = (dimension: Dimension, subject: string, pnl: number, count: number, unit: 'trades' | 'days' = 'trades') => {
    if (count > 0 && Number.isFinite(pnl) && pnl !== 0) {
      findings.push({ dimension, subject, pnl, count, unit, impact: Math.abs(pnl) });
    }
  };

  for (const row of coverage.sequence) add('sequence', `your ${row.label} trade${row.label.endsWith('+') ? 's' : ''} of the day`, row.pnl, row.trades);
  for (const row of coverage.load) add('load', `days with ${row.label}`, row.net, row.days, 'days');
  for (const row of coverage.expiry) add('expiry', `${row.label} contracts`, row.pnl, row.trades);
  for (const row of coverage.instruments) add('instrument', row.label.toLowerCase(), row.pnl, row.trades);
  for (const row of symbolPerformance(trades)) add('symbol', row.tag, row.pnl, row.trades);
  if (coverage.sizing) {
    add('sizing', 'your biggest quarter of positions', coverage.sizing.biggestQuarterNet, coverage.sizing.biggestQuarterTrades);
  }
  if (coverage.tilt && coverage.tilt.delta < 0) {
    // The cost of tilt is the gap between the two averages, paid once per trade taken after a loss.
    add('tilt', 'the trade straight after a loss', coverage.tilt.delta * coverage.tilt.afterLossCount, coverage.tilt.afterLossCount);
  }

  return findings;
}

/**
 * The instruction a drain points at, when the drain is something the trader does rather than
 * something they trade. "Stop after three" is a change; "SPY cost you money" is a fact.
 */
function changeFor(
  coverage: BrokerCoverage,
  findings: Finding[],
  threshold: number,
  fmt: (n: number) => string,
): Change | null {
  const candidates: Change[] = [];

  const seq = findings.filter((f) => f.dimension === 'sequence' && f.pnl < 0).sort((a, b) => b.impact - a.impact)[0];
  if (seq && coverage.sequence.length > 1) {
    const worst = coverage.sequence.find((r) => `your ${r.label} trade${r.label.endsWith('+') ? 's' : ''} of the day` === seq.subject);
    const cap = worst ? capBefore(worst.label) : null;
    const earlier = coverage.sequence.filter((r) => worst && r.label !== worst.label).reduce((s, r) => s + r.pnl, 0);
    if (cap !== null && earlier > seq.pnl) {
      candidates.push({
        dimension: 'sequence',
        impact: seq.impact,
        text: `Stop after your ${cap === 1 ? 'first' : cap === 2 ? 'second' : cap === 3 ? 'third' : `${cap}th`} trade of the day. Everything after it cost you ${fmt(seq.impact)}; the trades before it made ${fmt(earlier)}.`,
      });
    }
  }

  const load = findings.filter((f) => f.dimension === 'load' && f.pnl < 0).sort((a, b) => b.impact - a.impact)[0];
  if (load) {
    const row = coverage.load.find((r) => `days with ${r.label}` === load.subject);
    const best = [...coverage.load].sort((a, b) => b.perDay - a.perDay)[0];
    const cap = row ? capBelow(row.label) : null;
    if (row && best && cap !== null && best.perDay > row.perDay) {
      candidates.push({
        dimension: 'load',
        impact: load.impact,
        text: `Cap the day at ${cap} trade${cap === 1 ? '' : 's'}. Days with ${row.label} average ${fmt(row.perDay)}; days with ${best.label} average ${fmt(best.perDay)}.`,
      });
    }
  }

  const expiry = findings.filter((f) => f.dimension === 'expiry' && f.pnl < 0).sort((a, b) => b.impact - a.impact)[0];
  if (expiry) {
    const best = [...coverage.expiry].sort((a, b) => b.pnl - a.pnl)[0];
    if (best && best.pnl > 0 && `${best.label} contracts` !== expiry.subject) {
      candidates.push({
        dimension: 'expiry',
        impact: expiry.impact,
        text: `Trade fewer ${expiry.subject}, or size them down. They cost you ${fmt(expiry.impact)} while ${best.label} contracts made ${fmt(best.pnl)}.`,
      });
    }
  }

  if (coverage.sizing && coverage.sizing.biggestQuarterNet < 0 && coverage.sizing.biggestQuarterPerTrade < coverage.sizing.restPerTrade) {
    candidates.push({
      dimension: 'sizing',
      impact: Math.abs(coverage.sizing.biggestQuarterNet),
      text: `Size down. Your biggest quarter of positions loses ${fmt(Math.abs(coverage.sizing.biggestQuarterPerTrade))} a trade against ${fmt(Math.abs(coverage.sizing.restPerTrade))} on the rest.`,
    });
  }

  if (coverage.tilt && coverage.tilt.delta < 0) {
    candidates.push({
      dimension: 'tilt',
      impact: Math.abs(coverage.tilt.delta) * coverage.tilt.afterLossCount,
      text: `Take five minutes after a loss. The next trade is worth ${fmt(Math.abs(coverage.tilt.delta))} less than one taken after a win — ${coverage.tilt.afterLossCount} times over.`,
    });
  }

  return candidates.filter((c) => c.impact >= threshold).sort((a, b) => b.impact - a.impact)[0] ?? null;
}

function sentence(finding: Finding, fmt: (n: number) => string): string {
  const subject = finding.subject.charAt(0).toUpperCase() + finding.subject.slice(1);
  const over = `across ${finding.count} ${finding.count === 1 ? finding.unit.slice(0, -1) : finding.unit}`;
  return finding.pnl < 0
    ? `${subject} cost you ${fmt(Math.abs(finding.pnl))} ${over}.`
    : `${subject} made you ${fmt(finding.pnl)} ${over}.`;
}

export function performanceVerdict(trades: Trade[], fmt: (n: number) => string): PerformanceVerdict | null {
  if (trades.length < MIN_SAMPLE) return null;

  const coverage = brokerCoverage(trades);
  const threshold = minImpact(trades);
  const findings = collectFindings(trades, coverage).filter((f) => f.impact >= threshold);
  if (findings.length === 0) return null;

  const drain = findings.filter((f) => f.pnl < 0).sort((a, b) => b.impact - a.impact)[0] ?? null;
  const engine = findings.filter((f) => f.pnl > 0).sort((a, b) => b.impact - a.impact)[0] ?? null;
  const change = changeFor(coverage, findings, threshold, fmt);

  return {
    drain,
    engine,
    change,
    lines: {
      drain: drain ? sentence(drain, fmt) : null,
      engine: engine ? sentence(engine, fmt) : null,
    },
    net: trades.reduce((sum, t) => sum + effectivePnl(t), 0),
    trades: trades.length,
  };
}

/**
 * The Overview's "What is costing you": the biggest losses in the period, one per kind, then the
 * biggest earner.
 *
 * The same findings and the same threshold as the verdict, so the Overview and the Performance
 * screen cannot name different leaks for the same month. One per dimension because the dimensions
 * overlap — most 0DTE trades are SPY trades — and three rows that are one leak seen three ways would
 * crowd out the second leak. The earner is there so the card is a picture of the month rather than
 * a list of complaints; it comes last.
 */
export function overviewFindings(trades: Trade[], losses = 3): Finding[] {
  if (trades.length < MIN_SAMPLE) return [];
  const threshold = minImpact(trades);
  const findings = collectFindings(trades).filter((f) => f.impact >= threshold);
  const bestPerDimension = (sign: 1 | -1) => {
    const seen = new Set<Dimension>();
    return findings
      .filter((f) => Math.sign(f.pnl) === sign)
      .sort((a, b) => b.impact - a.impact)
      .filter((f) => (seen.has(f.dimension) ? false : (seen.add(f.dimension), true)));
  };
  const engine = bestPerDimension(1)[0];
  return [...bestPerDimension(-1).slice(0, losses), ...(engine ? [engine] : [])];
}

/**
 * The dollar impact a panel represents, for ordering the panels the same way the verdict is: the
 * one worth the most money first, drawn largest.
 */
export function panelImpact(coverage: BrokerCoverage, panel: keyof BrokerCoverage, net: number): number {
  switch (panel) {
    case 'breakeven':
      // The edge panel describes the whole period, so it ranks with the whole period's result.
      return coverage.breakeven ? Math.abs(net) : 0;
    case 'sizing':
      return coverage.sizing ? Math.abs(coverage.sizing.biggestQuarterNet) : 0;
    case 'tilt':
      return coverage.tilt ? Math.abs(coverage.tilt.delta) * coverage.tilt.afterLossCount : 0;
    case 'sequence':
      return Math.max(0, ...coverage.sequence.map((r) => Math.abs(r.pnl)));
    case 'load':
      return Math.max(0, ...coverage.load.map((r) => Math.abs(r.net)));
    case 'expiry':
      return Math.max(0, ...coverage.expiry.map((r) => Math.abs(r.pnl)));
    case 'instruments':
      return Math.max(0, ...coverage.instruments.map((r) => Math.abs(r.pnl)));
    case 'cost':
      return coverage.cost ? coverage.cost.fees : 0;
  }
}
