import type { TradingInsights } from './insights';

/**
 * One number for "how is my trading going", and the five it is made of.
 *
 * Every serious journal has one of these, and there is a good reason: a trader looking at nine
 * separate statistics cannot tell whether a profit factor of 1.3 with a 40% win rate is better or
 * worse than last month's 1.1 and 48%. A single score answers that, and the breakdown underneath
 * is what stops it being a horoscope — the score is never shown without the five components, so
 * "why is it 62" always has an answer you can point at.
 *
 * The five were picked so that no two measure the same thing:
 *
 *   Edge        — the win rate against the win rate the payoff ratio actually demands. This is the
 *                 only one that can tell a 30%-win-rate system that it is fine and a 60% one that
 *                 it is not, which is why win rate on its own is not a component.
 *   Payoff      — average win against average loss.
 *   Profit factor — gross won against gross lost. Close cousin of payoff, but sensitive to how
 *                 often rather than how much, so the two disagree in useful ways.
 *   Recovery    — profit against the deepest drawdown. The tradeability of the thing, as opposed
 *                 to its profitability.
 *   Consistency — how many trading days ended green, less the share of profit riding on the single
 *                 best one. A year made entirely on one Tuesday is not a repeatable year.
 *
 * They are averaged with equal weight. A weighting would be a claim about what matters most that
 * this journal has no evidence for, and equal weight is at least honest about that.
 */

export type ScoreBand = 'Needs work' | 'Developing' | 'Solid' | 'Strong';

export interface ScoreComponent {
  id: string;
  label: string;
  /** 0–100. */
  score: number;
  /** The underlying figure, formatted for display. */
  detail: string;
}

export interface TradingScore {
  total: number;
  band: ScoreBand;
  components: ScoreComponent[];
  /** What the score is worth reading as, given the sample behind it. */
  thin: boolean;
}

/** Below this the score is shown with a warning rather than withheld — see `thin`. */
export const RELIABLE_SAMPLE = 30;

/** Not worth computing at all under this: four trades produce a number, not a judgement. */
export const MIN_SAMPLE = 10;

/**
 * Maps a metric onto 0–100 between a floor and a target, clamped at both ends.
 *
 * The floor is not "the worst possible value" but "the value at which this is clearly broken", and
 * the target is "clearly good" rather than "perfect". Anything past the target scores 100 because
 * the difference between a profit factor of 2.4 and 4.0 is sample size, not skill.
 */
export function scale(value: number, floor: number, target: number): number {
  if (!Number.isFinite(value)) return value > 0 ? 100 : 0;
  if (target === floor) return 50;
  const pct = ((value - floor) / (target - floor)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function bandFor(total: number): ScoreBand {
  if (total >= 80) return 'Strong';
  if (total >= 60) return 'Solid';
  if (total >= 40) return 'Developing';
  return 'Needs work';
}

export function computeTradingScore(insights: TradingInsights): TradingScore | null {
  if (insights.tradeCount < MIN_SAMPLE) return null;

  const profitFactor = Number.isFinite(insights.profitFactor)
    ? insights.profitFactor
    : insights.grossProfit > 0
      ? 3
      : 0;

  /* Green days minus the share of the profit that came from the best one. A 70% green-day rate
     where one day is 80% of the profit is not consistency, and the subtraction is what stops the
     component rewarding it. */
  const concentrationPenalty = Math.max(0, insights.bestDayShare - 25);
  const consistency = Math.max(0, scale(insights.greenDayRate, 35, 70) - concentrationPenalty);

  const components: ScoreComponent[] = [
    {
      id: 'edge',
      label: 'Edge',
      score: scale(insights.edgeGap, -15, 10),
      detail:
        insights.requiredWinRate > 0
          ? `${Math.round(insights.winRate)}% won, ${Math.round(insights.requiredWinRate)}% needed`
          : `${Math.round(insights.winRate)}% won`,
    },
    {
      id: 'payoff',
      label: 'Payoff',
      score: scale(insights.payoff, 0.6, 2.5),
      detail: insights.payoff > 0 ? `${insights.payoff.toFixed(2)}× avg win / loss` : 'No losses yet',
    },
    {
      id: 'profit-factor',
      label: 'Profit factor',
      score: scale(profitFactor, 0.7, 2),
      detail: Number.isFinite(insights.profitFactor)
        ? insights.profitFactor.toFixed(2)
        : 'No losses yet',
    },
    {
      id: 'recovery',
      label: 'Recovery',
      score: scale(insights.recoveryFactor, 0, 3),
      detail:
        insights.recoveryFactor !== 0
          ? `${insights.recoveryFactor.toFixed(2)}× worst drawdown`
          : 'No drawdown yet',
    },
    {
      id: 'consistency',
      label: 'Consistency',
      score: consistency,
      detail: `${Math.round(insights.greenDayRate)}% of days green`,
    },
  ];

  const total = Math.round(
    components.reduce((sum, c) => sum + c.score, 0) / components.length,
  );

  return {
    total,
    band: bandFor(total),
    components,
    thin: insights.tradeCount < RELIABLE_SAMPLE,
  };
}
