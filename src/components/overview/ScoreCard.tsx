import { useMemo } from 'react';
import type { Trade } from '../../types';
import { computeTradingInsights } from '../../utils/insights';
import { computeTradingScore, type TradingScore } from '../../utils/tradingScore';

const BAND_TEXT: Record<TradingScore['band'], string> = {
  Strong: 'text-profit-bright',
  Solid: 'text-profit-bright',
  Developing: 'text-amber-300',
  'Needs work': 'text-loss-bright',
};
const BAND_TINT: Record<TradingScore['band'], string> = {
  Strong: 'bg-profit-bright/10',
  Solid: 'bg-profit-bright/10',
  Developing: 'bg-amber-400/10',
  'Needs work': 'bg-loss-bright/10',
};

/**
 * The period's score, small: the number, its band, and how much to trust it.
 *
 * The same computeTradingScore the insight grid used, so the number is the number it always was.
 * The five measures it is made of are on Performance; here it is a badge, because a composite on
 * the front page is a temperature reading, not a diagnosis.
 */
export function ScoreCard({ trades }: { trades: Trade[] }) {
  const insights = useMemo(() => computeTradingInsights(trades), [trades]);
  const score = useMemo(() => (insights ? computeTradingScore(insights) : null), [insights]);
  if (!score || !insights) return null;

  return (
    <section className="panel-card p-4">
      {/* Desktop rail */}
      <div className="hidden xl:flex items-center gap-3">
        <div className={`text-[34px] font-extrabold leading-none tabular-nums ${BAND_TEXT[score.band]}`}>{score.total}</div>
        <div className="text-xs text-text-secondary">
          <b className={`block text-[13px] ${BAND_TEXT[score.band]}`}>{score.band}</b>
          Score · {insights.tradeCount} trades{score.thin ? ', a small sample to read hard' : ''}
        </div>
      </div>
      {/* Phone and tablet */}
      <div className="flex items-center gap-3.5 xl:hidden">
        <div className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] text-[26px] font-extrabold tabular-nums ${BAND_TINT[score.band]} ${BAND_TEXT[score.band]}`}>
          {score.total}
        </div>
        <div>
          <b className={`block text-[15px] ${BAND_TEXT[score.band]}`}>{score.band}</b>
          <span className="text-[13px] text-text-secondary">
            Score from edge, payoff, profit factor, recovery and consistency.
            {score.thin ? ` ${insights.tradeCount} trades is a small sample.` : ''}
          </span>
        </div>
      </div>
    </section>
  );
}
