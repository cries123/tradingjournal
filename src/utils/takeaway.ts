import type { Trade } from '../types';
import type { TradingInsights } from './insights';
import {
  computeExcursionInsights,
  computeSessionPerformance,
  sessionPhrase,
  worstSession,
} from './tradeQuality';
import { breakevenWinRate } from './metricVerdict';

/**
 * Picks the ONE thing worth telling the trader about this period.
 *
 * A dashboard full of equally-weighted panels makes the reader do the work of figuring out what
 * matters. This runs the checks in priority order — costly leaks first, then execution problems,
 * then what's going right — and returns the first that fires, so the top of the page always
 * answers "what should I actually do differently".
 */

export type TakeawayTone = 'warning' | 'positive' | 'neutral';

export interface Takeaway {
  tone: TakeawayTone;
  text: string;
}

interface TakeawayInput {
  trades: Trade[];
  insights: TradingInsights;
  currencyFormat: (n: number) => string;
}

export function computeTakeaway({ trades, insights, currencyFormat }: TakeawayInput): Takeaway | null {
  if (trades.length < 3) return null;

  const money = (n: number) => currencyFormat(Math.abs(n));

  // 1. A setup that is actively bleeding — the most directly actionable thing there is.
  const worstSetup = insights.bottomSetups[0];
  if (worstSetup && worstSetup.trades >= 2 && worstSetup.pnl < 0) {
    const netIfCut = insights.expectancyPerTrade * trades.length - worstSetup.pnl;
    const wouldFlip = netIfCut > 0 && insights.expectancyPerTrade * trades.length <= 0;
    return {
      tone: 'warning',
      text: wouldFlip
        ? `${worstSetup.setup} cost you ${money(worstSetup.pnl)} across ${worstSetup.trades} trades — without it you'd be green this period.`
        : `${worstSetup.setup} is your biggest leak: ${money(worstSetup.pnl)} across ${worstSetup.trades} trades at a ${worstSetup.winRate.toFixed(0)}% win rate.`,
    };
  }

  // 2. A part of the day that consistently loses money.
  const bad = worstSession(computeSessionPerformance(trades));
  if (bad) {
    return {
      tone: 'warning',
      text: `Trading ${sessionPhrase(bad.session)} is costing you — ${money(bad.pnl)} across ${bad.trades} trades entered then.`,
    };
  }

  // 3. Giving back a large share of the move before exiting.
  const excursion = computeExcursionInsights(trades);
  if (excursion && excursion.winnerSample >= 3 && excursion.captureRate > 0 && excursion.captureRate < 70) {
    return {
      tone: 'warning',
      text: `You're exiting winners at ${excursion.captureRate.toFixed(0)}% of their peak — ${money(excursion.leftOnTable)} was on the screen and given back.`,
    };
  }

  // 4. Win rate that can't support the current win/loss ratio.
  const breakeven = breakevenWinRate(insights.avgWin, insights.avgLoss);
  if (breakeven !== null && insights.winRate < breakeven) {
    return {
      tone: 'warning',
      text: `Your ${insights.winRate.toFixed(0)}% win rate is below the ${breakeven.toFixed(0)}% you need at your current average win and loss — either win more often or let winners run further.`,
    };
  }

  // 5. A losing streak worth naming before it gets expensive.
  if (insights.streaks.worstRed >= 3 && insights.streaks.current < 0) {
    return {
      tone: 'warning',
      text: `You're ${Math.abs(insights.streaks.current)} red days into a streak — your worst run this period was ${insights.streaks.worstRed}.`,
    };
  }

  // 6. Nothing is broken: name what's carrying the period.
  const bestSetup = insights.topSetups[0];
  if (bestSetup && bestSetup.trades >= 2) {
    return {
      tone: 'positive',
      text: `${bestSetup.setup} is carrying you: ${money(bestSetup.pnl)} across ${bestSetup.trades} trades at a ${bestSetup.winRate.toFixed(0)}% win rate.`,
    };
  }

  const bestSymbol = insights.topSymbols[0];
  if (bestSymbol && bestSymbol.trades >= 2) {
    return {
      tone: 'positive',
      text: `${bestSymbol.symbol} is your best market this period — ${money(bestSymbol.pnl)} across ${bestSymbol.trades} trades.`,
    };
  }

  return null;
}
