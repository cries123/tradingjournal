import type { Trade } from '../types';
import { computeStats } from './stats';
import { computeTradingInsights } from './insights';
import {
  computeExcursionInsights,
  computeRMultipleInsights,
  computeSessionPerformance,
} from './tradeQuality';
import { breakevenWinRate } from './metricVerdict';
import {
  computeChecklistAdherence,
  computeDirectionSplit,
  computeFees,
  computeHoldTime,
  computeSelfAssessment,
  computeWeekdaySplit,
  type ChecklistFacts,
  type DirectionFacts,
  type HoldTimeFacts,
  type SelfAssessmentFacts,
  type WeekdayFact,
} from './behaviourFacts';
import { checkRuleViolations } from './tradingRules';

/**
 * Compiles a trader's journal into a compact set of already-computed facts for the assistant.
 *
 * This exists so the language model never does arithmetic. Every number here comes from the same
 * deterministic functions the dashboard renders from, so the assistant and the UI can't disagree,
 * and the model's job is reduced to explaining figures it was handed rather than deriving them —
 * which is the only version of this feature that can be trusted with someone's P&L.
 *
 * It also keeps the payload small. Sending a few hundred raw trades would be tens of thousands of
 * tokens per question; this is a couple of hundred, for a better answer.
 */

export interface JournalFacts {
  period: string;
  tradeCount: number;
  netPnl: number;
  winRate: number;
  /** The win rate this trader's own average win/loss needs just to break even. */
  breakevenWinRate: number | null;
  profitFactor: number;
  expectancyPerTrade: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  greenDays: number;
  redDays: number;
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
  currentStreak: number;
  worstLosingStreak: number;
  topSetups: { setup: string; pnl: number; trades: number; winRate: number }[];
  worstSetups: { setup: string; pnl: number; trades: number; winRate: number }[];
  topSymbols: { symbol: string; pnl: number; trades: number; winRate: number }[];
  worstSymbols: { symbol: string; pnl: number; trades: number; winRate: number }[];
  sessions: { session: string; pnl: number; trades: number; winRate: number }[] | null;
  execution: {
    captureRate: number;
    leftOnTable: number;
    avgHeatOnWinners: number;
    avgHeatOnLosers: number;
    roundTrips: number;
    sampleSize: number;
  } | null;
  rMultiple: { avgR: number; best: number; worst: number; sample: number } | null;

  /** How long winners are held versus losers — the discipline signal P&L can't show. */
  holdTime: HoldTimeFacts | null;
  /** What the trader's own A–F grades were actually worth. */
  selfAssessment: SelfAssessmentFacts | null;
  /** P&L on trades that followed the trader's checklist versus the ones that didn't. */
  checklist: ChecklistFacts | null;
  direction: DirectionFacts | null;
  weekdays: WeekdayFact[] | null;
  fees: { total: number; trades: number } | null;
  /** Breaches of the trader's OWN configured limits — their rules, not ours. */
  ruleBreaches: { date: string; type: string; message: string }[] | null;
  /**
   * The trader's own words on their trades, when they've opted in.
   *
   * Off by default. These are personal notes, and sending them to a model is a decision the trader
   * makes rather than one the app makes for them.
   */
  notes: { date: string; symbol: string; pnl: number; note: string }[] | null;
}

export interface JournalFactsOptions {
  /** Include the trader's written notes. Requires their explicit opt-in. */
  includeNotes?: boolean;
  /** The trader's configured risk limits, so breaches can be reported against their own rules. */
  rules?: { enabled: boolean; maxDailyLoss?: number; maxTradesPerDay?: number; maxDailyGain?: number };
}

/** Notes are the only free-text in the payload, so they're the only part that needs bounding. */
const MAX_NOTES = 12;
const MAX_NOTE_CHARS = 180;

/**
 * Picks the notes worth sending: the biggest winners and losers.
 *
 * A trader's note on a $600 loss is where the useful pattern lives; the note on a $4 scratch is
 * not worth a token. Sorting by absolute P&L and taking from both ends keeps the sample honest —
 * only sending losses would let the model conclude the trader never writes about winning.
 */
function selectNotes(trades: Trade[]): { date: string; symbol: string; pnl: number; note: string }[] {
  const withNotes = trades.filter((t) => t.notes?.trim());
  if (withNotes.length === 0) return [];

  return [...withNotes]
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, MAX_NOTES)
    .map((t) => ({
      date: t.date,
      symbol: t.symbol,
      pnl: money(t.pnl),
      note: t.notes!.trim().slice(0, MAX_NOTE_CHARS),
    }));
}

/** Rounds to cents so the payload doesn't carry meaningless float precision into the prompt. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildJournalFacts(
  trades: Trade[],
  period: string,
  options: JournalFactsOptions = {},
): JournalFacts | null {
  if (trades.length === 0) return null;

  const stats = computeStats(trades);
  const insights = computeTradingInsights(trades);
  if (!insights) return null;

  const selectedNotes = options.includeNotes ? selectNotes(trades) : [];
  const excursion = computeExcursionInsights(trades);
  const rMultiple = computeRMultipleInsights(trades);
  const sessions = computeSessionPerformance(trades);

  return {
    period,
    tradeCount: stats.totalTrades,
    netPnl: money(stats.netPnl),
    winRate: pct(stats.winRate),
    breakevenWinRate:
      stats.winningTrades > 0 && stats.losingTrades > 0
        ? pct(breakevenWinRate(stats.avgRR, 1) ?? 0)
        : null,
    profitFactor: Number.isFinite(insights.profitFactor) ? pct(insights.profitFactor) : 99,
    expectancyPerTrade: money(insights.expectancyPerTrade),
    avgWin: money(insights.avgWin),
    avgLoss: money(insights.avgLoss),
    maxDrawdown: money(insights.maxDrawdown),
    greenDays: insights.greenDays,
    redDays: insights.redDays,
    bestDay: insights.bestDay
      ? { date: insights.bestDay.date, pnl: money(insights.bestDay.pnl) }
      : null,
    worstDay: insights.worstDay
      ? { date: insights.worstDay.date, pnl: money(insights.worstDay.pnl) }
      : null,
    currentStreak: insights.streaks.current,
    worstLosingStreak: insights.streaks.worstRed,
    topSetups: insights.topSetups.map((s) => ({
      setup: s.setup,
      pnl: money(s.pnl),
      trades: s.trades,
      winRate: pct(s.winRate),
    })),
    worstSetups: insights.bottomSetups.map((s) => ({
      setup: s.setup,
      pnl: money(s.pnl),
      trades: s.trades,
      winRate: pct(s.winRate),
    })),
    topSymbols: insights.topSymbols.map((s) => ({
      symbol: s.symbol,
      pnl: money(s.pnl),
      trades: s.trades,
      winRate: pct(s.winRate),
    })),
    worstSymbols: insights.bottomSymbols.map((s) => ({
      symbol: s.symbol,
      pnl: money(s.pnl),
      trades: s.trades,
      winRate: pct(s.winRate),
    })),
    sessions: sessions
      ? sessions.map((s) => ({
          session: s.session,
          pnl: money(s.pnl),
          trades: s.trades,
          winRate: pct(s.winRate),
        }))
      : null,
    execution: excursion
      ? {
          captureRate: pct(excursion.captureRate),
          leftOnTable: money(excursion.leftOnTable),
          avgHeatOnWinners: money(excursion.avgHeatOnWinners),
          avgHeatOnLosers: money(excursion.avgHeatOnLosers),
          roundTrips: excursion.roundTrips,
          sampleSize: excursion.winnerSample,
        }
      : null,
    rMultiple: rMultiple
      ? {
          avgR: Math.round(rMultiple.avgR * 100) / 100,
          best: rMultiple.best,
          worst: rMultiple.worst,
          sample: rMultiple.sample,
        }
      : null,

    holdTime: computeHoldTime(trades),
    selfAssessment: computeSelfAssessment(trades),
    checklist: computeChecklistAdherence(trades),
    direction: computeDirectionSplit(trades),
    weekdays: computeWeekdaySplit(trades),
    fees: computeFees(trades),
    ruleBreaches: options.rules?.enabled
      ? (() => {
          const breaches = checkRuleViolations(trades, options.rules!);
          return breaches.length > 0 ? breaches.slice(0, 10) : null;
        })()
      : null,
    notes: selectedNotes.length > 0 ? selectedNotes : null,
  };
}

export interface SuggestedQuestion {
  id: string;
  label: string;
  question: string;
}

/**
 * Builds the opening questions from what's actually in the trader's data.
 *
 * A blank chat box has the blank-page problem: people don't know what to ask, and the findings
 * worth the most are the ones they'd never think to ask about. These are generated from the facts
 * above, so a trader who never logs MAE isn't offered a question about giving back profit, and
 * someone whose losses cluster at the open gets asked about exactly that.
 */
export function suggestedQuestions(facts: JournalFacts): SuggestedQuestion[] {
  const out: SuggestedQuestion[] = [];

  // Behavioural findings lead. A trader who holds losers seven times longer than winners has a
  // bigger problem than their worst setup, and it's the one they're least likely to ask about
  // unaided — which is exactly what these openers are for.
  if (facts.holdTime?.holdsLosersLonger) {
    out.push({
      id: 'hold-time',
      label: 'Why do I hold losers longer?',
      question:
        'I hold my losers much longer than my winners. What does that pattern look like in my data, and what does it cost me?',
    });
  }

  if (facts.selfAssessment?.gradingInverted) {
    out.push({
      id: 'grades',
      label: 'Are my trade grades wrong?',
      question:
        'Compare the grades I gave my own trades against what they actually made. Am I judging my execution accurately?',
    });
  }

  if (facts.checklist && facts.checklist.skippedPnl < 0) {
    out.push({
      id: 'checklist',
      label: 'Does my checklist actually help?',
      question:
        'Compare the trades where I followed my checklist against the ones where I skipped it. Is the checklist earning its place?',
    });
  }

  if (facts.ruleBreaches && facts.ruleBreaches.length > 0) {
    out.push({
      id: 'rules',
      label: `I broke my rules ${facts.ruleBreaches.length}×`,
      question:
        'I broke my own risk limits on some days this period. What happened on those days compared with the days I stayed inside them?',
    });
  }

  const worstSetup = facts.worstSetups[0];
  if (worstSetup) {
    out.push({
      id: 'worst-setup',
      label: `Why is ${worstSetup.setup} losing?`,
      question: `My ${worstSetup.setup} setup lost money this period. What does the data say about it, and what should I watch for?`,
    });
  }

  const worstSession = facts.sessions
    ? [...facts.sessions].sort((a, b) => a.pnl - b.pnl)[0]
    : null;
  if (worstSession && worstSession.pnl < 0) {
    out.push({
      id: 'session',
      label: `What happens when I trade the ${worstSession.session.toLowerCase()}?`,
      question: `How does my performance differ by time of day, and what stands out about the ${worstSession.session.toLowerCase()}?`,
    });
  }

  if (facts.execution && facts.execution.captureRate < 85) {
    out.push({
      id: 'capture',
      label: 'Am I exiting winners too early?',
      question:
        'Based on how much of each winner’s peak I actually captured, am I exiting too early? What would you look at?',
    });
  }

  if (facts.breakevenWinRate !== null) {
    out.push({
      id: 'winrate',
      label: 'Is my win rate good enough?',
      question:
        'Given my average win and average loss, is my win rate high enough to be profitable? Explain the relationship.',
    });
  }

  out.push({
    id: 'review',
    label: 'Review my whole period',
    question:
      'Walk me through this period overall — what went well, what cost me money, and what one thing should I focus on?',
  });

  // Cap the list, but never at the cost of the catch-all — a trader with four behavioural findings
  // should still be able to just ask for the overview.
  const review = out[out.length - 1];
  return out.length <= 5 ? out : [...out.slice(0, 4), review];
}
