import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { useEntitlement } from '../../context/useEntitlement';
import { formatCurrencyCompact } from '../../utils/format';
import { overviewFindings, type Dimension } from '../../utils/performanceVerdict';
import { lowestTierWith, TIER_PLANS } from '../../config/tiers';
import { goToPricing } from '../../utils/navigateToPath';

interface CostingCardProps {
  /** The period's trades — the month or the year on screen. */
  trades: Trade[];
  periodLabel: string;
  onOpenPerformance?: () => void;
}

/** Which Performance breakdown each finding comes from, under its sentence. */
const SOURCE: Record<Dimension, string> = {
  sequence: 'Trade of the day',
  load: 'Trades per day',
  expiry: 'Expiry',
  instrument: 'Calls, puts and shares',
  symbol: 'Symbols',
  sizing: 'Position size',
  tilt: 'After a loss',
};

/**
 * Where the period's money went, in four lines ranked by dollars.
 *
 * The same findings at the same threshold as the Performance screen's verdict (overviewFindings),
 * so a leak named here is the leak that screen leads with, and each line names the breakdown it
 * came from. On a plan without the Performance screen it says what it would show and which plan has
 * it — these findings are that screen's analysis, the line the assistant's preview draws too.
 */
export function CostingCard({ trades, periodLabel, onOpenPerformance }: CostingCardProps) {
  const { settings } = useSettings();
  const { has } = useEntitlement();
  const unlocked = has('performanceAnalytics');
  const rows = useMemo(() => (unlocked ? overviewFindings(trades) : []), [trades, unlocked]);
  const plan = lowestTierWith('performanceAnalytics');

  return (
    <section className="panel-card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold xl:text-sm xl:font-semibold">What is costing you</h2>
        {unlocked && onOpenPerformance && (
          <button type="button" onClick={onOpenPerformance} className="text-[13px] text-accent hover:text-accent/80 focus-ring rounded xl:text-xs">
            Performance →
          </button>
        )}
      </div>

      {!unlocked ? (
        <div className="mt-2">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Which part of your trading costs the most, and what is making money, ranked in dollars.
          </p>
          <button type="button" onClick={goToPricing} className="mt-3 inline-flex items-center gap-1.5 btn-secondary px-3 py-1.5 text-xs">
            <Lock size={12} aria-hidden />
            {plan ? `On ${TIER_PLANS[plan].name} and up` : 'See plans'}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          Not enough trades in {periodLabel} to rank yet. This fills in as the month does.
        </p>
      ) : (
        <ul>
          {rows.map((f, i) => (
            <li
              key={`${f.dimension}-${f.subject}`}
              className={`grid grid-cols-[76px_minmax(0,1fr)] gap-2.5 py-3 text-sm leading-[1.35] xl:grid-cols-[64px_minmax(0,1fr)] xl:py-2.5 xl:text-[12.5px] ${
                i > 0 ? 'border-t border-white/[0.06]' : 'pt-1'
              }`}
            >
              <span className={`text-right font-extrabold tabular-nums xl:font-bold ${f.pnl < 0 ? 'text-loss-bright' : 'text-profit-bright'}`}>
                {formatCurrencyCompact(f.pnl, settings.currency)}
              </span>
              <span>
                {f.subject.charAt(0).toUpperCase() + f.subject.slice(1)}, across {f.count} {f.count === 1 ? f.unit.slice(0, -1) : f.unit}.
                <span className="mt-[3px] block text-xs text-text-secondary/70 xl:mt-0.5 xl:text-[11px]">{SOURCE[f.dimension]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
