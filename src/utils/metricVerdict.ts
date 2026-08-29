/**
 * Turns raw metrics into a verdict a trader can act on.
 *
 * Deliberately conservative about what it will grade. Profit factor and expectancy have a real
 * "good" direction, so those get graded. Win rate does NOT — a 35% win rate with 3R winners beats
 * a 70% win rate that gives it all back, and tools that slap a red badge on "45% win rate" are
 * actively teaching people the wrong lesson. Instead we compare win rate against the breakeven
 * rate implied by the trader's own average win/loss, which is the honest version of the question.
 */

export type VerdictTone = 'good' | 'ok' | 'bad' | 'neutral';

export interface Verdict {
  tone: VerdictTone;
  /** Short enough to sit under the number without wrapping on mobile. */
  label: string;
}

export function profitFactorVerdict(pf: number): Verdict {
  if (!Number.isFinite(pf)) return { tone: 'good', label: 'No losing trades yet' };
  if (pf <= 0) return { tone: 'neutral', label: 'Not enough data' };
  if (pf < 1) return { tone: 'bad', label: 'Losing — under 1.0' };
  if (pf < 1.25) return { tone: 'ok', label: 'Thin margin' };
  if (pf < 1.75) return { tone: 'good', label: 'Solid' };
  return { tone: 'good', label: 'Strong' };
}

export function expectancyVerdict(expectancy: number): Verdict {
  if (expectancy > 0) return { tone: 'good', label: 'Positive edge per trade' };
  if (expectancy < 0) return { tone: 'bad', label: 'Negative edge per trade' };
  return { tone: 'neutral', label: 'Breakeven' };
}

/**
 * The win rate you would need, given your average win and average loss, just to break even.
 * Returns null when there isn't enough of both sides to compute it honestly.
 */
export function breakevenWinRate(avgWin: number, avgLoss: number): number | null {
  if (avgWin <= 0 || avgLoss <= 0) return null;
  const ratio = avgWin / avgLoss;
  return (1 / (1 + ratio)) * 100;
}

export function winRateVerdict(winRate: number, avgWin: number, avgLoss: number): Verdict {
  const breakeven = breakevenWinRate(avgWin, avgLoss);
  if (breakeven === null) return { tone: 'neutral', label: 'Need wins and losses to judge' };

  const margin = winRate - breakeven;
  const be = `needs ${breakeven.toFixed(0)}%`;

  if (margin >= 10) return { tone: 'good', label: `Comfortably above breakeven (${be})` };
  if (margin >= 0) return { tone: 'ok', label: `Just above breakeven (${be})` };
  return { tone: 'bad', label: `Below breakeven (${be})` };
}

/** Drawdown only means something next to what you made — 400 down on 4,000 up is not 400 down on 200 up. */
export function drawdownVerdict(maxDrawdown: number, netPnl: number): Verdict {
  if (maxDrawdown <= 0) return { tone: 'good', label: 'No drawdown yet' };
  if (netPnl <= 0) return { tone: 'bad', label: 'Underwater for the period' };
  const ratio = maxDrawdown / netPnl;
  if (ratio < 0.35) return { tone: 'good', label: 'Small next to your gains' };
  if (ratio < 0.75) return { tone: 'ok', label: 'Meaningful next to your gains' };
  return { tone: 'bad', label: 'Large next to your gains' };
}

export const VERDICT_TEXT_CLASS: Record<VerdictTone, string> = {
  good: 'text-profit-bright',
  ok: 'text-amber-300',
  bad: 'text-loss-bright',
  neutral: 'text-text-secondary',
};
