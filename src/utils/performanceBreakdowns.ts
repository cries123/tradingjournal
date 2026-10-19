import type { Trade } from '../types';
import type { RuleRow } from './playbook';
import {
  brokerCoverage,
  daysToExpiry,
  type BreakevenStats,
  type BrokerCoverage,
  type CostStats,
  type SizingStats,
  type TiltStats,
} from './brokerAnalytics';
import { csvCell } from './csvCell';
import {
  executionCoverage,
  parseHour,
  symbolPerformance,
  tagPerformance,
  type DisciplineStats,
  type ExcursionStats,
  type ExecutionCoverage,
  type ExpectancyStats,
  type HourlyBreakdown,
  type TagRow,
} from './executionAnalytics';
import { panelImpact } from './performanceVerdict';
import {
  capOutcome,
  partsText,
  signed,
  signedWhole,
  toneOf,
  whole,
  type Fmt,
  type Part,
  type PeriodWords,
  type Tone,
} from './performanceScreen';

/**
 * The Performance screen's breakdowns: one model for every way the period can be cut, so the
 * desktop table, the phone's rows, "Copy table" and Export all read the same figures.
 *
 * The approved redesign replaced twelve cards — each its own shape, each ending in its own sentence —
 * with a list down the left, biggest first, and the chosen breakdown drawn once at full size: a lead
 * sentence, a table with a bar either side of zero, the rule simulator when a cap would have helped,
 * and a line saying how it was counted. That only works if every breakdown fits one shape, which is
 * what this file is. It computes nothing new: every figure is a row of brokerAnalytics or
 * executionAnalytics, ranked by the same panelImpact the cards were, and the cap figures are the
 * rule simulator's.
 *
 * The sample gates are theirs too. A breakdown appears only when its analytics function returned
 * something, and those return nothing below MIN_SAMPLE / MIN_PER_GROUP — the list gets shorter rather
 * than a table concluding something from four trades.
 */

export type BreakdownKey =
  | 'sequence'
  | 'expiry'
  | 'symbols'
  | 'instruments'
  | 'load'
  | 'sizing'
  | 'cost'
  | 'tilt'
  | 'edge'
  | 'setups'
  | 'hourly'
  | 'discipline'
  | 'expectancy'
  | 'excursions';

export interface GroupRow {
  /** "4th and later" — the desktop table's words. */
  label: string;
  /** "4th+" — the phone's 44px column. */
  short: string;
  /** Trades, or days for the day-size breakdown. */
  count: number;
  /** Percent, or null where the group has no win rate (position size, the trade after a loss). */
  winRate: number | null;
  /** Average per trade (or per day). */
  per: number | null;
  net: number;
  /** The row the lead sentence is about, tinted on both layouts. */
  highlight: boolean;
}

export interface GroupTable {
  /** The first column's heading: "Trade of the day", "Symbol". */
  heading: string;
  unit: 'trade' | 'day';
  /** "Win %", or "Green %" for days. */
  winLabel: string;
  rows: GroupRow[];
  /** The muted last row, or null where the groups overlap (a trade with two tags is in both). */
  total: GroupRow | null;
}

export interface Fact {
  label: string;
  value: string;
  tone: Tone;
}

/** A daily trade cap the rule simulator replayed, and what it would have made of the period. */
export interface CapTest {
  cap: number;
  simulated: number;
  actual: number;
}

export interface Breakdown {
  key: BreakdownKey;
  /** The list's name: "Trade of the day". */
  title: string;
  /** Beside the title on the card: "where each trade fell in its day". */
  about: string;
  /** The list's figure: "-$5,689", "-$4/trade". */
  figure: { text: string; tone: Tone };
  /** Dollars, for the order. Breakdowns with no dollar figure rank last. */
  impact: number;
  lead: Part[];
  /** The phone's shorter lead: the counts are on every row under it already. */
  phoneLead: Part[];
  table: GroupTable | null;
  facts: Fact[];
  /** Discipline only: the playbook, rule by rule. */
  rules: RuleRow[];
  cap: CapTest | null;
  /** "How this is counted", as a sentence. */
  how: string;
}

/** A breakdown that needs a field the journal does not have yet, and what to record. */
export interface MissingBreakdown {
  key: BreakdownKey;
  title: string;
  /** The list's few words: "needs entry times". */
  short: string;
  needs: string;
}

export interface BreakdownSet {
  /** Biggest first. */
  list: Breakdown[];
  /** The edge sits in its own card on a desktop rather than in the list; it has no dollar figure to rank by. */
  edge: Breakdown | null;
  breakeven: BreakevenStats | null;
  missing: MissingBreakdown[];
  period: PeriodWords;
}

/** Enough to name the worst habits without turning the card into the whole checklist. */
const RULES_SHOWN = 4;

/**
 * Closer than this, as a share of the larger average, and the trade after a loss is "about the
 * same" as the one after a win. Below it the old panel said "you trade the same" over a $36 gap,
 * which contradicted its own figures.
 */
const SAME_WITHIN = 0.1;

const loss = (text: string): Part => ({ text, tone: 'loss' });
const profit = (text: string): Part => ({ text, tone: 'profit' });
const mark = (text: string, tone: Tone | null): Part => (tone ? { text, tone } : text);

/* ------------------------------------------------------------------ shared shapes */

/**
 * The lead a group table opens with: what cost the most, and what earns the most per trade.
 *
 * The best row is chosen per trade, not in total, because "your 1st trade made the most" is mostly
 * a statement that there are more first trades than fourth ones. The mockup's sentence names the
 * total for the drain and the rate for the best, and so does this.
 */
function groupLead(
  rows: GroupRow[],
  name: (row: GroupRow, tone: Tone | null) => Part[],
  plural: (row: GroupRow) => boolean,
  unit: 'trade' | 'day',
  fmt: Fmt,
  short: boolean,
): Part[] {
  if (rows.length === 0) return [];
  const worst = rows.reduce((a, b) => (b.net < a.net ? b : a));
  const top = rows.reduce((a, b) => (b.net > a.net ? b : a));
  const best = rows.filter((r) => r.per !== null).reduce<GroupRow | null>((a, b) => (!a || b.per! > a.per! ? b : a), null);
  const units = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;

  const lead = worst.net < 0 ? worst : top;
  const parts: Part[] =
    worst.net < 0
      ? [...name(worst, 'loss'), ' cost you ', loss(fmt(Math.abs(worst.net))), short ? '.' : ` across ${units(worst.count)}.`]
      : [...name(top, 'profit'), ' made you ', profit(fmt(top.net)), short ? '.' : ` across ${units(top.count)}.`];

  if (best && best !== lead && best.per! > 0) {
    const verb = plural(best) ? ' are the best at ' : short ? ' is the best at ' : ' is the best one at ';
    parts.push(' ', ...name(best, null), verb, profit(fmt(best.per!)), ` a ${unit}.`);
  }
  return parts;
}

/** The muted last row: the groups added up, called "All trades" only when that is what they are. */
function totalOf(rows: GroupRow[], everything: number, allLabel: string): GroupRow {
  const count = rows.reduce((s, r) => s + r.count, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const winRate = rows.every((r) => r.winRate !== null) && count > 0
    ? rows.reduce((s, r) => s + (r.winRate! * r.count), 0) / count
    : null;
  return {
    label: count === everything ? allLabel : 'Total',
    short: 'All',
    count,
    winRate,
    per: count > 0 ? net / count : null,
    net,
    highlight: false,
  };
}

/** The row worth the most money, either way: what the list shows beside the name. */
function leadFigure(rows: GroupRow[], fmt: Fmt): Breakdown['figure'] {
  const lead = rows.reduce((a, b) => (Math.abs(b.net) > Math.abs(a.net) ? b : a));
  return { text: signedWhole(lead.net, fmt), tone: toneOf(lead.net) };
}

function highlightWorst(rows: GroupRow[]): GroupRow[] {
  const worst = rows.reduce<GroupRow | null>((a, b) => (!a || b.net < a.net ? b : a), null);
  return rows.map((r) => ({ ...r, highlight: r === worst && r.net < 0 }));
}

function tagRows(rows: TagRow[]): GroupRow[] {
  return rows.map((r) => ({ label: r.tag, short: r.tag, count: r.trades, winRate: r.winRate, per: r.perTrade, net: r.pnl, highlight: false }));
}

/** The ordinal before "4th+", or the low end of "6–10 trades": the cap that removes the group. */
function capBefore(label: string): number | null {
  const n = Number.parseInt(label, 10);
  return Number.isFinite(n) && n > 1 ? n - 1 : null;
}

/** A cap test, shown only when the cap would have helped — a callout selling a cap that loses is not a test. */
function capTest(trades: Trade[], cap: number | null): CapTest | null {
  if (cap === null) return null;
  const { simulated, actual } = capOutcome(trades, cap);
  return simulated > actual ? { cap, simulated, actual } : null;
}

/* ------------------------------------------------------------------ the broker half */

function sequenceBreakdown(trades: Trade[], coverage: BrokerCoverage, fmt: Fmt, timed: number): Breakdown {
  const rows = highlightWorst(
    coverage.sequence.map((r) => ({
      label: r.label.endsWith('+') ? `${r.label.slice(0, -1)} and later` : r.label,
      short: r.label,
      count: r.trades,
      winRate: r.winRate,
      per: r.perTrade,
      net: r.pnl,
      highlight: false,
    })),
  );
  const plural = (r: GroupRow) => r.label.endsWith('and later');
  const name = (r: GroupRow, tone: Tone | null): Part[] => ['Your ', mark(r.label, tone), plural(r) ? ' trades' : ' trade'];
  const worst = rows.find((r) => r.highlight);

  /*
   * Said honestly for each kind of journal. A Schwab feed carries a date and no clock, so the order
   * inside a day is the order the broker's activity rows came in — usually right, never promised.
   */
  const order =
    timed === 0
      ? ' Your broker sends dates without fill times, so the order follows your broker’s feed.'
      : timed < trades.length
        ? ' By entry time where a trade has one, and by your broker’s feed where it does not.'
        : ' By entry time.';

  return {
    key: 'sequence',
    title: 'Trade of the day',
    about: 'where each trade fell in its day',
    figure: leadFigure(rows, fmt),
    impact: panelImpact(coverage, 'sequence', 0),
    lead: groupLead(rows, name, plural, 'trade', fmt, false),
    phoneLead: groupLead(rows, name, plural, 'trade', fmt, true),
    table: { heading: 'Trade of the day', unit: 'trade', winLabel: 'Win %', rows, total: totalOf(rows, trades.length, 'All trades') },
    facts: [],
    rules: [],
    cap: worst ? capTest(trades, capBefore(worst.short)) : null,
    how: `Trades in the order they happened inside each day.${order} A position needs three trades before it gets a row.`,
  };
}

function expiryBreakdown(trades: Trade[], coverage: BrokerCoverage, fmt: Fmt): Breakdown {
  const rows = highlightWorst(
    coverage.expiry.map((r) => ({
      label: r.label === '0DTE' ? '0DTE' : `${r.label} left`,
      short: r.label === '0DTE' ? '0DTE' : r.label.replace(' days', 'd'),
      count: r.trades,
      winRate: r.winRate,
      per: r.perTrade,
      net: r.pnl,
      highlight: false,
    })),
  );
  const name = (r: GroupRow, tone: Tone | null): Part[] =>
    r.short === '0DTE' ? [mark('0DTE', tone), ' contracts'] : ['Contracts with ', mark(r.label.replace(' left', ''), tone), ' left'];
  const options = trades.filter((t) => daysToExpiry(t) !== null).length;

  return {
    key: 'expiry',
    title: 'Expiry',
    about: 'time left when you opened',
    figure: leadFigure(rows, fmt),
    impact: panelImpact(coverage, 'expiry', 0),
    lead: groupLead(rows, name, () => true, 'trade', fmt, false),
    phoneLead: groupLead(rows, name, () => true, 'trade', fmt, true),
    table: { heading: 'Time left', unit: 'trade', winLabel: 'Win %', rows, total: totalOf(rows, options, 'All options') },
    facts: [],
    rules: [],
    cap: null,
    how: 'Days from the day the position was opened to its expiry, options only. A group needs three trades before it gets a row.',
  };
}

function instrumentBreakdown(trades: Trade[], coverage: BrokerCoverage, fmt: Fmt): Breakdown {
  const rows = highlightWorst(
    coverage.instruments.map((r) => ({ label: r.label, short: r.label, count: r.trades, winRate: r.winRate, per: r.perTrade, net: r.pnl, highlight: false })),
  );
  const name = (r: GroupRow, tone: Tone | null): Part[] => [mark(r.label, tone)];
  return {
    key: 'instruments',
    title: 'Calls, puts, shares',
    about: 'each kind of position on its own',
    figure: leadFigure(rows, fmt),
    impact: panelImpact(coverage, 'instruments', 0),
    lead: groupLead(rows, name, () => true, 'trade', fmt, false),
    phoneLead: groupLead(rows, name, () => true, 'trade', fmt, true),
    table: { heading: 'Kind', unit: 'trade', winLabel: 'Win %', rows, total: totalOf(rows, trades.length, 'All trades') },
    facts: [],
    rules: [],
    cap: null,
    how: 'Options by their type, and stock trades as shares. A group needs three trades before it gets a row.',
  };
}

function loadBreakdown(trades: Trade[], coverage: BrokerCoverage, fmt: Fmt): Breakdown {
  const rows = highlightWorst(
    coverage.load.map((r) => ({
      label: r.label,
      short: r.label.replace(' trades', ''),
      count: r.days,
      winRate: (r.greenDays / r.days) * 100,
      per: r.perDay,
      net: r.net,
      highlight: false,
    })),
  );
  const name = (r: GroupRow, tone: Tone | null): Part[] => ['Days with ', mark(r.label, tone)];
  const worst = rows.find((r) => r.highlight);
  const days = new Set(trades.map((t) => t.date)).size;
  return {
    key: 'load',
    title: 'Trades per day',
    about: 'whole days, by how much you traded',
    figure: leadFigure(rows, fmt),
    impact: panelImpact(coverage, 'load', 0),
    lead: groupLead(rows, name, () => true, 'day', fmt, false),
    phoneLead: groupLead(rows, name, () => true, 'day', fmt, true),
    table: { heading: 'Day size', unit: 'day', winLabel: 'Green %', rows, total: totalOf(rows, days, 'All days') },
    facts: [],
    rules: [],
    cap: worst ? capTest(trades, capBefore(worst.label)) : null,
    how: 'Each trading day once, grouped by how many trades it had. A group needs three days before it gets a row.',
  };
}

function sizingBreakdown(trades: Trade[], s: SizingStats, coverage: BrokerCoverage, fmt: Fmt): Breakdown {
  /* Per trade, not in total. On a journal where both halves lose money, comparing the totals says
     the small trades are the bigger problem purely because there are three times as many of them. */
  const bigOnesCostMore = s.biggestQuarterPerTrade < 0 && s.biggestQuarterPerTrade < s.restPerTrade * 1.5;
  const backwards = s.ratio > 1.15;
  const rows: GroupRow[] = [
    { label: 'Biggest quarter', short: 'Biggest', count: s.biggestQuarterTrades, winRate: null, per: s.biggestQuarterPerTrade, net: s.biggestQuarterNet, highlight: bigOnesCostMore },
    { label: 'Everything else', short: 'Rest', count: s.restTrades, winRate: null, per: s.restPerTrade, net: s.restNet, highlight: false },
  ];
  const lead: Part[] = bigOnesCostMore
    ? ['Your biggest quarter of positions loses ', loss(fmt(Math.abs(s.biggestQuarterPerTrade))), ` a trade; the rest ${s.restPerTrade >= 0 ? 'make' : 'lose'} ${fmt(Math.abs(s.restPerTrade))} a trade.`]
    : backwards
      ? ['You put ', loss(`${s.ratio.toFixed(2)}×`), ' more on the trades that lose than on the ones that win. Conviction is pointing the wrong way.']
      : s.ratio < 0.87
        ? ['Your winners carry ', profit(`${(1 / s.ratio).toFixed(2)}×`), ' the size of your losers — size is following the edge, which is the right way around.']
        : ['Winners and losers are sized about the same, so the result is coming from the trades themselves rather than from how much you bet.'];
  return {
    key: 'sizing',
    title: 'Position size',
    about: 'your biggest quarter against the rest',
    figure: { text: signedWhole(s.biggestQuarterNet, fmt), tone: toneOf(s.biggestQuarterNet) },
    impact: panelImpact(coverage, 'sizing', 0),
    lead,
    phoneLead: lead,
    table: { heading: 'Positions', unit: 'trade', winLabel: 'Win %', rows, total: totalOf(rows, trades.length, 'All trades') },
    facts: [
      { label: 'Average size, winners', value: fmt(s.avgWinnerSize), tone: 'neutral' },
      { label: 'Average size, losers', value: fmt(s.avgLoserSize), tone: 'neutral' },
    ],
    rules: [],
    cap: null,
    how: 'Size is what a position cost going in: quantity × entry price, × 100 for an option. The biggest quarter is the top 25% of positions by that size.',
  };
}

function costBreakdown(c: CostStats, coverage: BrokerCoverage, fmt: Fmt): Breakdown {
  const heavy = c.shareOfGross >= 20;
  const fee = mark(fmt(c.fees), heavy ? 'loss' : null);
  const lead: Part[] =
    c.grossProfit <= 0
      ? [`Commissions across ${c.covered} trades came to `, fee, '. There was no gross profit this period for them to come out of.']
      : heavy
        ? [loss(`${c.shareOfGross.toFixed(0)}%`), ' of everything you made gross went to commissions. Fewer, larger trades is the only lever that moves this one.']
        : [`Commissions took ${c.shareOfGross.toFixed(0)}% of your gross profit across ${c.covered} trades — not what is deciding your results.`];
  return {
    key: 'cost',
    title: 'Fees',
    about: 'what trading cost you',
    figure: { text: whole(c.fees, fmt), tone: heavy ? 'loss' : 'neutral' },
    impact: panelImpact(coverage, 'cost', 0),
    lead,
    phoneLead: lead,
    table: null,
    facts: [
      { label: 'Fees', value: fmt(c.fees), tone: heavy ? 'loss' : 'neutral' },
      { label: 'Per trade', value: fmt(c.perTrade), tone: 'neutral' },
      { label: 'Gross profit', value: fmt(c.grossProfit), tone: 'neutral' },
      { label: 'Of gross profit', value: c.grossProfit > 0 ? `${c.shareOfGross.toFixed(0)}%` : '—', tone: heavy ? 'loss' : 'neutral' },
    ],
    rules: [],
    cap: null,
    how: 'Commissions and fees as your broker reported them, on the trades that carry one. The share is of the gross profit on those same trades.',
  };
}

/** What the trade after a loss is worth, in words. Exported for its own test: it once contradicted its figures. */
export function tiltLead(t: TiltStats, fmt: Fmt): Part[] {
  const tilts = t.delta < 0;
  const scale = Math.max(Math.abs(t.afterLossAvg), Math.abs(t.afterWinAvg), 1);
  const same = Math.abs(t.delta) <= scale * SAME_WITHIN;
  if (tilts && !same) {
    return ['The trade you take straight after a red one is worth ', loss(fmt(Math.abs(t.delta))), ' less than the one after a green one. That gap is the cost of trading angry, and a five-minute rule after a loss is the cheapest fix in this journal.'];
  }
  if (same) {
    return [`You trade about the same after a loss as after a win — the gap is only ${fmt(Math.abs(t.delta))}. Whatever is costing you, it is not tilt.`];
  }
  return ['The trade after a loss is worth ', profit(fmt(t.delta)), ' more than the one after a win. Losing does not rattle you — if anything you tighten up afterward. Whatever is costing you, it is not tilt.'];
}

function tiltBreakdown(t: TiltStats, coverage: BrokerCoverage, fmt: Fmt): Breakdown {
  const rows: GroupRow[] = [
    // The net is the average times the count — the same product panelImpact ranks this breakdown by.
    { label: 'After a loss', short: 'Loss', count: t.afterLossCount, winRate: null, per: t.afterLossAvg, net: t.afterLossAvg * t.afterLossCount, highlight: t.delta < 0 },
    { label: 'After a win', short: 'Win', count: t.afterWinCount, winRate: null, per: t.afterWinAvg, net: t.afterWinAvg * t.afterWinCount, highlight: false },
  ];
  const lead = tiltLead(t, fmt);
  return {
    key: 'tilt',
    title: 'After a loss',
    about: 'the next trade, after a red one or a green one',
    figure: { text: `${signedWhole(t.delta, fmt)}/trade`, tone: toneOf(t.delta) },
    /*
     * Ranked by what tilt cost — the gap times the trades taken after a loss — only when there is a
     * cost. When the trade after a loss is the better one, that product is not money anybody made or
     * lost, and ranking by it put "+$36/trade" at the top of a list headed "biggest first", above a
     * $3,500 finding. performanceVerdict draws the same line: a tilt that pays is not a finding.
     */
    impact: t.delta < 0 ? panelImpact(coverage, 'tilt', 0) : 0,
    lead,
    phoneLead: lead,
    table: { heading: 'The trade', unit: 'trade', winLabel: 'Win %', rows, total: null },
    facts: [],
    rules: [],
    cap: null,
    how: 'Each trade paired with the one before it on the same day. A day’s first trade follows nothing, so it is not counted.',
  };
}

function edgeBreakdown(b: BreakevenStats, fmt: Fmt): Breakdown {
  const clears = b.gap >= 0;
  const points = Math.round(Math.abs(b.gap));
  const text = points === 0 ? 'At break-even' : `${points} point${points === 1 ? '' : 's'} ${clears ? 'clear' : 'short'}`;
  const lead: Part[] = clears
    ? [`Your average win is ${b.payoff.toFixed(2)}× your average loss, so ${b.requiredWinRate.toFixed(0)}% pays for itself — and you win `, profit(`${b.winRate.toFixed(0)}%`), '. The edge is in the payoff, not the hit rate.']
    : [`Your average win is ${b.payoff.toFixed(2)}× your average loss, which needs ${b.requiredWinRate.toFixed(0)}% to break even. You win `, loss(`${b.winRate.toFixed(0)}%`), `. Closing ${points} point${points === 1 ? '' : 's'} is either winning more often or losing less per loss — the second is usually the shorter trip.`];
  const phoneLead: Part[] = clears
    ? [`Your average win is ${b.payoff.toFixed(2)}× your average loss, so ${b.requiredWinRate.toFixed(0)}% pays for itself.`]
    : [`Your average win is ${b.payoff.toFixed(2)}× your average loss. Losing less per loss is usually the shorter way to close the gap.`];
  return {
    key: 'edge',
    title: 'Edge',
    about: 'the win rate your payoff needs',
    figure: { text, tone: clears ? 'profit' : 'loss' },
    impact: 0,
    lead,
    phoneLead,
    table: null,
    facts: [
      { label: 'You win', value: `${b.winRate.toFixed(0)}%`, tone: clears ? 'profit' : 'loss' },
      { label: 'You need', value: `${b.requiredWinRate.toFixed(0)}%`, tone: 'neutral' },
      { label: 'Average win', value: fmt(b.avgWin), tone: 'profit' },
      { label: 'Average loss', value: fmt(-b.avgLoss), tone: 'loss' },
      { label: 'Payoff', value: `${b.payoff.toFixed(2)}×`, tone: 'neutral' },
    ],
    rules: [],
    cap: null,
    how: 'The break-even win rate is your average loss ÷ (average win + average loss). Below it, the wins do not pay for the losses.',
  };
}

/* ------------------------------------------------------------------ the recorded half */

function symbolBreakdown(trades: Trade[], rows: TagRow[], fmt: Fmt): Breakdown {
  const groups = highlightWorst(tagRows(rows));
  const name = (r: GroupRow, tone: Tone | null): Part[] => [mark(r.label, tone)];
  return {
    key: 'symbols',
    title: 'Symbols',
    about: 'what each ticker made',
    figure: leadFigure(groups, fmt),
    impact: Math.max(0, ...rows.map((r) => Math.abs(r.pnl))),
    lead: groupLead(groups, name, () => false, 'trade', fmt, false),
    phoneLead: groupLead(groups, name, () => false, 'trade', fmt, true),
    table: { heading: 'Symbol', unit: 'trade', winLabel: 'Win %', rows: groups, total: totalOf(groups, trades.length, 'All trades') },
    facts: [],
    rules: [],
    cap: null,
    how: 'Every trade by its ticker, after fees. A ticker needs three trades before it gets a row.',
  };
}

function setupBreakdown(rows: TagRow[], fmt: Fmt): Breakdown {
  const groups = highlightWorst(tagRows(rows));
  const name = (r: GroupRow, tone: Tone | null): Part[] => [mark(r.label, tone)];
  return {
    key: 'setups',
    title: 'Setups',
    about: 'what each setup or tag made',
    figure: leadFigure(groups, fmt),
    impact: Math.max(0, ...rows.map((r) => Math.abs(r.pnl))),
    lead: groupLead(groups, name, () => false, 'trade', fmt, false),
    phoneLead: groupLead(groups, name, () => false, 'trade', fmt, true),
    // No total: a trade with two tags is in both rows, so the rows do not add up to anything.
    table: { heading: 'Setup', unit: 'trade', winLabel: 'Win %', rows: groups, total: null },
    facts: [],
    rules: [],
    cap: null,
    how: 'Each setup or tag on every trade that carries it, so a trade with two tags is in both rows. A tag needs three trades before it gets a row.',
  };
}

function hourBreakdown(trades: Trade[], data: HourlyBreakdown, fmt: Fmt): Breakdown {
  const groups = highlightWorst(
    data.rows
      .filter((r) => r.trades > 0)
      .map((r) => ({ label: r.label, short: r.label, count: r.trades, winRate: r.winRate, per: r.pnl / r.trades, net: r.pnl, highlight: false })),
  );
  const name = (r: GroupRow, tone: Tone | null): Part[] => ['Trades entered around ', mark(r.label, tone)];
  return {
    key: 'hourly',
    title: 'Hour of day',
    about: 'by the hour you entered',
    figure: leadFigure(groups, fmt),
    impact: Math.max(0, ...groups.map((r) => Math.abs(r.net))),
    lead: groupLead(groups, name, () => true, 'trade', fmt, false),
    phoneLead: groupLead(groups, name, () => true, 'trade', fmt, true),
    table: { heading: 'Hour entered', unit: 'trade', winLabel: 'Win %', rows: groups, total: totalOf(groups, data.covered, 'All timed trades') },
    facts: [],
    rules: [],
    cap: null,
    how: `By the hour on each trade’s entry time. ${data.covered} of ${trades.length} trades have one; the rest are left out.`,
  };
}

function expectancyBreakdown(trades: Trade[], e: ExpectancyStats): Breakdown {
  const r = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}R`;
  const positive = e.expectancy >= 0;
  const lead: Part[] = positive
    ? ['Every trade is worth ', profit(r(e.expectancy)), ` on average — the edge holds over ${e.covered} trades with a recorded risk.`]
    : ['The average trade loses ', loss(`${Math.abs(e.expectancy).toFixed(2)}R`), ` across ${e.covered} trades, whatever the win rate says.`];
  return {
    key: 'expectancy',
    title: 'R multiples',
    about: 'results in units of the risk you took',
    figure: { text: r(e.expectancy), tone: toneOf(e.expectancy) },
    impact: 0,
    lead,
    phoneLead: lead,
    table: null,
    facts: [
      { label: 'Per trade', value: r(e.expectancy), tone: toneOf(e.expectancy) },
      { label: 'Average win', value: r(e.avgWinR), tone: 'profit' },
      { label: 'Average loss', value: r(e.avgLossR), tone: 'loss' },
      { label: 'Win rate', value: `${Math.round(e.winRate)}%`, tone: 'neutral' },
      { label: 'Best', value: r(e.bestR), tone: toneOf(e.bestR) },
      { label: 'Worst', value: r(e.worstR), tone: toneOf(e.worstR) },
    ],
    rules: [],
    cap: null,
    how: `R is a trade’s result in units of the risk you entered for it. ${e.covered} of ${trades.length} trades have one.`,
  };
}

function excursionBreakdown(x: ExcursionStats, fmt: Fmt): Breakdown {
  const stopTooTight = x.avgMaeWinners > 0 && x.avgMaeWinners >= x.avgMaeLosers * 0.9;
  const leftOnTable = x.avgMfeLosers > 0;
  const lead: Part[] = stopTooTight
    ? ['Your winners dip about as far as your losers do before working — a tighter stop would have cut them too.']
    : leftOnTable
      ? ['Losing trades were up ', profit(fmt(x.avgMfeLosers)), ' on average before turning. That is the exit, not the entry.']
      : ['Adverse and favorable excursion across the trades that recorded them.'];
  const covered = Math.max(x.coveredMae, x.coveredMfe);
  return {
    key: 'excursions',
    title: 'How far trades ran',
    about: 'against you, and in your favor',
    figure: { text: `${covered} trades`, tone: 'neutral' },
    impact: 0,
    lead,
    phoneLead: lead,
    table: null,
    facts: [
      { label: 'Winners went against you', value: fmt(x.avgMaeWinners), tone: 'neutral' },
      { label: 'Losers went against you', value: fmt(x.avgMaeLosers), tone: 'neutral' },
      { label: 'Winners ran for you', value: fmt(x.avgMfeWinners), tone: 'neutral' },
      { label: 'Losers ran for you first', value: fmt(x.avgMfeLosers), tone: 'neutral' },
    ],
    rules: [],
    cap: null,
    how: 'MAE is how far a trade went against you; MFE is how far it ran in your favor. Both as you recorded them, averaged per trade.',
  };
}

function disciplineBreakdown(d: DisciplineStats, fmt: Fmt): Breakdown {
  const both = d.followedPerTrade !== null && d.ignoredPerTrade !== null;
  const gradeRows = highlightWorst(
    d.grades.map((g) => ({ label: g.grade, short: g.grade, count: g.trades, winRate: g.winRate, per: g.pnl / g.trades, net: g.pnl, highlight: false })),
  );
  const checklistRows: GroupRow[] = [
    ...(d.followedPerTrade !== null ? [{ label: 'Checklist followed', short: 'Kept', count: d.followedCount, winRate: null, per: d.followedPerTrade, net: d.followedPerTrade * d.followedCount, highlight: false }] : []),
    ...(d.ignoredPerTrade !== null ? [{ label: 'Checklist ignored', short: 'Skipped', count: d.ignoredCount, winRate: null, per: d.ignoredPerTrade, net: d.ignoredPerTrade * d.ignoredCount, highlight: false }] : []),
  ];
  const gap = both ? d.followedPerTrade! - d.ignoredPerTrade! : null;
  const name = (r: GroupRow, tone: Tone | null): Part[] => ['Your ', mark(r.label, tone), '-graded trades'];

  const lead: Part[] = both
    ? gap! > 0
      ? ['Trades that followed the checklist made ', { text: fmt(d.followedPerTrade!), tone: toneOf(d.followedPerTrade!) }, ' a trade; the ones that skipped it made ', { text: fmt(d.ignoredPerTrade!), tone: toneOf(d.ignoredPerTrade!) }, '. Sticking to it is worth money here, which is the argument for keeping it.']
      : ['The trades that ignored the checklist did better: ', { text: fmt(d.ignoredPerTrade!), tone: toneOf(d.ignoredPerTrade!) }, ' a trade against ', { text: fmt(d.followedPerTrade!), tone: toneOf(d.followedPerTrade!) }, '. Either the rules need changing, or this is a small sample being read too hard.']
    : gradeRows.length > 0
      ? groupLead(gradeRows, name, () => true, 'trade', fmt, false)
      : ['Your checklist results, trade by trade.'];

  const table: GroupTable | null =
    gradeRows.length > 0
      ? { heading: 'Grade', unit: 'trade', winLabel: 'Win %', rows: gradeRows, total: totalOf(gradeRows, d.coveredGrades, 'All graded trades') }
      : checklistRows.length > 0
        ? { heading: 'Checklist', unit: 'trade', winLabel: 'Win %', rows: checklistRows, total: null }
        : null;

  return {
    key: 'discipline',
    title: 'Discipline',
    about: 'did following the plan pay?',
    figure: gap !== null ? { text: `${signedWhole(gap, fmt)}/trade`, tone: toneOf(gap) } : { text: `${d.coveredGrades} graded`, tone: 'neutral' },
    impact: 0,
    lead,
    phoneLead: lead,
    table,
    // With grades in the table, the checklist's two averages sit under it as figures.
    facts:
      gradeRows.length > 0 && both
        ? [
            { label: `Checklist followed (${d.followedCount})`, value: `${fmt(d.followedPerTrade!)} a trade`, tone: toneOf(d.followedPerTrade!) },
            { label: `Checklist ignored (${d.ignoredCount})`, value: `${fmt(d.ignoredPerTrade!)} a trade`, tone: toneOf(d.ignoredPerTrade!) },
          ]
        : [],
    // The most expensive rule to break sorts first, because that is the one worth stopping.
    rules: d.rules.slice(0, RULES_SHOWN),
    cap: null,
    how: 'Grades as you gave them. A checklist counts as followed when 80% or more of its rules were ticked.',
  };
}

/* ------------------------------------------------------------------ what is missing */

/**
 * What each recorded breakdown needs, said once in the list rather than as a dashed card. The list's
 * few words are the mockup's; the longer sentence is what opens when one is chosen.
 */
function missingBreakdowns(exec: ExecutionCoverage): MissingBreakdown[] {
  const missing: MissingBreakdown[] = [];
  if (exec.tags.length === 0) {
    missing.push({
      key: 'setups',
      title: 'Setups',
      short: 'tag 3 trades',
      needs: 'Needs a setup or tag on at least three trades of the same kind. Tag them as you review and this fills in within a week.',
    });
  }
  if (!exec.hourly) {
    missing.push({
      key: 'hourly',
      title: 'Hour of day',
      short: 'needs entry times',
      needs: 'Needs a clock time on at least five entries. Some brokers send it with the fill and some send only the date — where yours does not, the time field on the trade form fills this in.',
    });
  }
  if (!exec.expectancy) {
    missing.push({
      key: 'expectancy',
      title: 'R multiples',
      short: 'needs your risk',
      needs: 'Needs the R multiple on at least five trades — the result in units of the risk you took. The Edge card is the version of this that needs nothing.',
    });
  }
  if (!exec.discipline) {
    missing.push({
      key: 'discipline',
      title: 'Discipline',
      short: 'tick a checklist',
      needs: 'Needs a grade or a ticked checklist on at least five trades. Give a strategy its rules under Settings → Strategy playbook, pick it on a trade, and tick what you did — this then shows which rule costs you money when you skip it.',
    });
  }
  if (!exec.excursions) {
    missing.push({
      key: 'excursions',
      title: 'How far trades ran',
      short: 'needs MAE and MFE',
      needs: 'Needs MAE and MFE — how far a trade went against you, and how far it ran in your favor. Together they say whether the stop or the exit is what is costing you.',
    });
  }
  return missing;
}

/* ------------------------------------------------------------------ all of it */

export function buildBreakdowns(
  trades: Trade[],
  fmt: Fmt,
  period: PeriodWords,
  coverage: BrokerCoverage = brokerCoverage(trades),
): BreakdownSet {
  const exec = executionCoverage(trades);
  const timed = trades.filter((t) => parseHour(t.entryTime) !== null).length;
  /* Every row past the gate, not the top eight executionCoverage keeps for its cards: sorted by money
     and cut at eight, a ticker that lost more than the eighth-best made would vanish from the table. */
  const symbols = symbolPerformance(trades, 3, Number.POSITIVE_INFINITY);
  const tags = tagPerformance(trades, 3, Number.POSITIVE_INFINITY);

  // Built in the documented order, which is also the order ties keep.
  const all: Breakdown[] = [];
  if (coverage.sequence.length > 1) all.push(sequenceBreakdown(trades, coverage, fmt, timed));
  if (coverage.expiry.length > 1) all.push(expiryBreakdown(trades, coverage, fmt));
  if (symbols.length > 0) all.push(symbolBreakdown(trades, symbols, fmt));
  if (coverage.instruments.length > 1) all.push(instrumentBreakdown(trades, coverage, fmt));
  if (coverage.load.length > 1) all.push(loadBreakdown(trades, coverage, fmt));
  if (coverage.sizing) all.push(sizingBreakdown(trades, coverage.sizing, coverage, fmt));
  if (coverage.cost) all.push(costBreakdown(coverage.cost, coverage, fmt));
  if (coverage.tilt) all.push(tiltBreakdown(coverage.tilt, coverage, fmt));
  if (tags.length > 0) all.push(setupBreakdown(tags, fmt));
  if (exec.hourly) all.push(hourBreakdown(trades, exec.hourly, fmt));
  if (exec.discipline) all.push(disciplineBreakdown(exec.discipline, fmt));
  if (exec.expectancy) all.push(expectancyBreakdown(trades, exec.expectancy));
  if (exec.excursions) all.push(excursionBreakdown(exec.excursions, fmt));

  const list = all
    .map((b, i) => ({ b, i }))
    .sort((a, z) => z.b.impact - a.b.impact || a.i - z.i)
    .map(({ b }) => b);

  return {
    list,
    edge: coverage.breakeven ? edgeBreakdown(coverage.breakeven, fmt) : null,
    breakeven: coverage.breakeven,
    missing: missingBreakdowns(exec),
    period,
  };
}

/**
 * Whatever the set holds under a key — a breakdown, the edge, or a missing one — or null.
 *
 * Null is the case that matters: a breakdown chosen in one period can be gone in the next (a month
 * too thin for its gate), and the screen falls back to the biggest one rather than to nothing.
 */
export function findEntry(set: BreakdownSet, key: string | null): Breakdown | MissingBreakdown | null {
  if (!key) return null;
  return set.list.find((b) => b.key === key) ?? (set.edge?.key === key ? set.edge : null) ?? set.missing.find((m) => m.key === key) ?? null;
}

export function isBreakdown(entry: Breakdown | MissingBreakdown): entry is Breakdown {
  return 'lead' in entry;
}

/* ------------------------------------------------------------------ copy and export */

const pct = (n: number | null) => (n === null ? '' : `${Math.round(n)}%`);

/**
 * "Copy table": the chosen breakdown as tab-separated lines, which a spreadsheet pastes into
 * columns. Formatted as the screen shows it, since it is pasted for a person to read.
 */
export function breakdownTsv(b: Breakdown, fmt: Fmt): string {
  const lines: string[] = [`${b.title} — ${partsText(b.lead)}`];
  if (b.table) {
    const t = b.table;
    const hasWin = t.rows.some((r) => r.winRate !== null);
    lines.push([t.heading, t.unit === 'day' ? 'Days' : 'Trades', ...(hasWin ? [t.winLabel] : []), `Avg / ${t.unit}`, 'Net'].join('\t'));
    for (const r of t.total ? [...t.rows, t.total] : t.rows) {
      lines.push([r.label, String(r.count), ...(hasWin ? [pct(r.winRate)] : []), r.per === null ? '' : signed(r.per, fmt), signed(r.net, fmt)].join('\t'));
    }
  }
  for (const f of b.facts) lines.push(`${f.label}\t${f.value}`);
  return lines.join('\n');
}

const num = (n: number | null) => (n === null ? '' : n.toFixed(2));

/**
 * Export: every breakdown on the screen as one CSV, numbers unformatted so a spreadsheet can add
 * them up. Facts that are not a row of a table (fees per trade, the edge) go in the last column as
 * the screen words them.
 */
export function breakdownsCsv(set: BreakdownSet, periodLabel: string): string {
  const head = ['Period', 'Breakdown', 'Group', 'Count', 'Unit', 'Win %', 'Average', 'Net', 'Value'];
  const lines = [head.join(',')];
  const add = (cells: (string | number | null)[]) => lines.push(cells.map((c) => csvCell(c ?? '')).join(','));
  for (const b of [...set.list, ...(set.edge ? [set.edge] : [])]) {
    if (b.table) {
      for (const r of b.table.total ? [...b.table.rows, b.table.total] : b.table.rows) {
        add([periodLabel, b.title, r.label, r.count, `${b.table.unit}s`, r.winRate === null ? '' : r.winRate.toFixed(1), num(r.per), num(r.net), '']);
      }
    }
    for (const f of b.facts) add([periodLabel, b.title, f.label, '', '', '', '', '', f.value]);
  }
  return lines.join('\n');
}
