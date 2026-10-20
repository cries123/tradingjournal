import type { JournalFacts } from './journalFacts';
import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';
import { breakevenStats } from './brokerAnalytics';

/**
 * What the assistant says before anybody asks it anything.
 *
 * The panel used to open on a blank thread and a list of suggested questions, which asks the
 * trader to already know what is interesting in their own history — the exact thing they came here
 * to find out. Most people never type anything and leave thinking the feature is empty.
 *
 * COMPUTED HERE, NOT BY THE MODEL. Opening the screen must not spend a message from somebody's
 * daily allowance, must not wait on a network call, and must not be able to invent a figure. These
 * are the same numbers the Performance screen draws, phrased as findings, and every one of them
 * names the evidence so the trader can disagree with it.
 */

export interface Finding {
  /** Short label for the row. */
  headline: string;
  /** The finding itself, with its own numbers in it. */
  detail: string;
  /**
   * The finding as a starting point on the Assistant page: its one number, then the rest of the
   * sentence — "23 pts" + "short of the win rate your payoff needs".
   *
   * The page leads each card with the number because the number is what makes it worth a
   * question, and a headline plus three lines of detail was too much to read three times over
   * before typing anything. Null when the finding has no single number to lead with; the card
   * then leads with `lead` alone, which is the headline.
   */
  figure: string | null;
  lead: string;
  /** What to ask the assistant to go deeper. Feeds the existing question flow. */
  question: string;
  tone: 'bad' | 'good' | 'neutral';
}

const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

/** A win-rate gap in points, without the trailing ".0" that pct() leaves on a whole number. */
const points = (n: number) => `${Math.round(Math.abs(n) * 10) / 10} pts`;

/**
 * The findings worth leading with, strongest first.
 *
 * Capped by the caller rather than here. The order is deliberate: a losing expectancy outranks
 * everything else because it is the one that makes the rest academic, and costs come last because
 * they are the easiest to act on and the least likely to be the main problem.
 */
export function openingFindings(facts: JournalFacts): Finding[] {
  const out: Finding[] = [];

  if (facts.breakeven) {
    const b = facts.breakeven;
    const short = b.gap < 0;
    out.push({
      headline: short ? 'Your win rate is below what your payoff needs' : 'Your edge covers your payoff',
      detail: short
        ? `You win ${b.winRate}% and need ${b.requiredWinRate}% just to break even — ${Math.abs(b.gap)} points short. Your average win is ${money(b.avgWin)} against ${money(b.avgLoss)} lost.`
        : `You win ${b.winRate}% and need ${b.requiredWinRate}% to break even, so you are ${b.gap} points clear. Average win ${money(b.avgWin)} against ${money(b.avgLoss)} lost.`,
      figure: points(b.gap),
      lead: short ? 'short of the win rate your payoff needs' : 'clear of the win rate your payoff needs',
      question: short
        ? 'My win rate is below the one my payoff ratio needs. Which is further away — winning more often, or losing less per loss?'
        : 'My win rate clears the one my payoff ratio needs. Where is that margin thinnest?',
      tone: short ? 'bad' : 'good',
    });
  }

  if (facts.ruleSimulation && facts.ruleSimulation.daysChanged > 0) {
    const r = facts.ruleSimulation;
    const helped = r.difference > 0;
    out.push({
      headline: helped ? 'Your own limits would have helped' : 'Your own limits would have cost you',
      detail: helped
        ? `Keeping the limits you set would have changed ${r.daysChanged} of ${r.tradingDays} days and left you ${money(r.difference)} better off — ${money(r.lossesAvoided)} of losses avoided against ${money(r.winnersGivenUp)} of winners given up.`
        : `Keeping the limits you set would have changed ${r.daysChanged} of ${r.tradingDays} days and left you ${money(Math.abs(r.difference))} worse off — ${money(r.winnersGivenUp)} of winners given up against ${money(r.lossesAvoided)} of losses avoided.`,
      /* The trades the limits would have removed made exactly −difference between them
         (difference is simulated − actual), so this is the same number the simulator shows,
         stated as what those trades did rather than as a rule's verdict. */
      figure: helped ? money(-r.difference) : `+${money(-r.difference)}`,
      lead: 'came from trades past your own limits',
      question: 'What would keeping my own daily limits have done to this period, and which days did it change?',
      tone: helped ? 'bad' : 'neutral',
    });
  }

  /*
   * The Performance screen's headline, nearly always: the trades past the first few give the day
   * back. The pooled last row against everything before it, which is how the screen states it.
   */
  const seq = facts.sequence;
  if (seq && seq.length > 1) {
    const late = seq[seq.length - 1];
    const before = seq.slice(0, -1).reduce((s, r) => s + r.pnl, 0);
    if (late.pnl < 0 && before > 0) {
      out.push({
        headline: 'Your later trades give the day back',
        detail: `Your ${late.position} trades of the day lost ${money(late.pnl)} across ${late.trades}. The trades before them made ${money(before)}.`,
        figure: money(late.pnl),
        lead: `from your ${late.position} trades of the day`,
        question: `My ${late.position} trades of the day lose while the earlier ones make money. What does the data say about where in the day my money goes?`,
        tone: 'bad',
      });
    }
  }

  /* Jay's own pitch: −$496 a day on 11+ trade days against +$163 on 1–2 trade days. */
  const load = facts.dailyLoad;
  if (load && load.length > 1) {
    const busiest = load[load.length - 1];
    const quietest = load[0];
    if (busiest.perDay < 0 && quietest.perDay > 0) {
      out.push({
        headline: 'Your busy days lose',
        detail: `Days with ${busiest.tradesPerDay} average ${money(busiest.perDay)} across ${busiest.days} days. Days with ${quietest.tradesPerDay} average ${money(quietest.perDay)} across ${quietest.days}.`,
        figure: money(busiest.perDay),
        lead: `a day on your ${busiest.tradesPerDay} days`,
        question: 'Compare my busy days with my quiet ones. What does trading more in a day do to my results?',
        tone: 'bad',
      });
    }
  }

  if (facts.tilt && facts.tilt.delta < 0) {
    const t = facts.tilt;
    out.push({
      headline: 'The trade after a loss is the expensive one',
      detail: `Trades taken straight after a loser average ${money(t.afterLossAvg)} across ${t.afterLossCount}, against ${money(t.afterWinAvg)} after a winner. That gap is ${money(t.delta)} a trade.`,
      // Unsigned: "worse" already says which way, and "-$100 … worse" reads as a double negative.
      figure: money(Math.abs(t.delta)),
      lead: 'a trade worse straight after a loss than after a win',
      question: 'What does the trade I take straight after a loss cost me, and when does it happen most?',
      tone: 'bad',
    });
  }

  if (facts.sizing && facts.sizing.ratio > 1) {
    const s = facts.sizing;
    out.push({
      headline: 'Your bigger positions are the losing ones',
      detail: `Your average loser is ${s.ratio}x the size of your average winner. The biggest quarter of your positions runs ${money(s.biggestQuarterPerTrade)} a trade against ${money(s.restPerTrade)} for the rest.`,
      figure: `${s.ratio}x`,
      lead: 'the size of your average winner, on your average loser',
      question: 'My losing trades are bigger than my winning ones. Where is the sizing going wrong?',
      tone: 'bad',
    });
  }

  if (facts.holdTime?.holdsLosersLonger) {
    out.push({
      headline: 'You hold losers longer than winners',
      detail: 'Winners are being cut while losers are given room — the opposite of the trade you meant to take.',
      figure: null,
      lead: 'You hold losers longer than winners',
      question: 'I hold my losers longer than my winners. How much is that costing me?',
      tone: 'bad',
    });
  }

  if (facts.selfAssessment?.gradingInverted) {
    out.push({
      headline: 'Your own grades are inverted',
      detail: 'The trades you graded best made less than the ones you graded worst, so the grading is not tracking execution.',
      figure: null,
      lead: 'Your own grades are inverted',
      question: 'My best-graded trades made less than my worst-graded ones. What am I judging wrong?',
      tone: 'bad',
    });
  }

  if (facts.costs && facts.costs.shareOfGross >= 20) {
    const c = facts.costs;
    out.push({
      headline: 'Commissions are eating the gross',
      detail: `${money(c.fees)} in fees across ${c.sample} trades — ${c.shareOfGross}% of your gross profit, at ${money(c.perTrade)} a trade.`,
      figure: `${c.shareOfGross}%`,
      lead: 'of your gross profit went to commissions',
      question: 'How much of my gross profit went to commissions, and which trades cost the most to run?',
      tone: 'bad',
    });
  }

  return out;
}

/** A month of results, for the trend block. */
export interface MonthSummary {
  /** YYYY-MM. */
  month: string;
  netPnl: number;
  trades: number;
  winRate: number;
  /** winRate − the rate their payoff needed that month. Null when it could not be computed. */
  breakevenGap: number | null;
}

/** Months of history handed to the model. Enough to see a run, short enough to stay cheap. */
const TREND_MONTHS = 6;

/**
 * The last few months, so the assistant can see a run rather than a snapshot.
 *
 * Every other block describes one period in isolation, which is why it could never say "that is
 * the third month running" — the thing a person reviewing their own trading most wants to hear.
 * Summaries only: four numbers a month, not the trades, so it costs almost nothing to send.
 */
export function monthlyTrend(trades: Trade[], months = TREND_MONTHS): MonthSummary[] {
  const byMonth = new Map<string, Trade[]>();

  for (const trade of trades) {
    const month = trade.date?.slice(0, 7);
    if (!month || month.length !== 7) continue;
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(trade);
    else byMonth.set(month, [trade]);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, rows]) => {
      const pnls = rows.map(effectivePnl);
      const wins = pnls.filter((p) => p > 0).length;
      const decided = pnls.filter((p) => p !== 0).length;
      const breakeven = breakevenStats(rows);

      return {
        month,
        netPnl: Math.round(pnls.reduce((a, b) => a + b, 0) * 100) / 100,
        trades: rows.length,
        winRate: decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0,
        breakevenGap: breakeven ? Math.round(breakeven.gap * 10) / 10 : null,
      };
    });
}
