import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { useEntitlement } from '../../context/useEntitlement';
import { formatCurrencyCompact } from '../../utils/format';
import { overviewFindings } from '../../utils/performanceVerdict';
import { lowestTierWith, TIER_PLANS } from '../../config/tiers';
import { goToPricing } from '../../utils/navigateToPath';

interface CostingCardProps {
  /** The period's trades — the month or the year on screen. */
  trades: Trade[];
  periodLabel: string;
  onOpenPerformance?: () => void;
}

/**
 * Where the period's money went, in four lines ranked by dollars.
 *
 * It stands in for the Performance screen on the Overview: the same findings at the same threshold
 * (overviewFindings), so a leak named here is the leak that screen leads with. On a plan without the
 * Performance screen it says what it would show and which plan has it — those findings are that
 * screen's analysis, which is the line the assistant's preview draws too.
 */
export function CostingCard({ trades, periodLabel, onOpenPerformance }: CostingCardProps) {
  const { settings } = useSettings();
  const { has } = useEntitlement();
  const unlocked = has('performanceAnalytics');
  const rows = useMemo(() => (unlocked ? overviewFindings(trades) : []), [trades, unlocked]);
  const plan = lowestTierWith('performanceAnalytics');

  return (
    <section className="panel-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold">What is costing you</h2>
        {unlocked && onOpenPerformance && (
          <button type="button" onClick={onOpenPerformance} className="text-xs text-accent hover:text-accent/80 focus-ring rounded">
            Performance
          </button>
        )}
      </div>

      {!unlocked ? (
        <div className="mt-2">
          <p className="text-[13px] text-text-secondary leading-relaxed">
            Which part of your trading costs the most, and what is making money, ranked in dollars.
          </p>
          <button type="button" onClick={goToPricing} className="mt-3 inline-flex items-center gap-1.5 btn-secondary text-xs px-3 py-1.5">
            <Lock size={12} aria-hidden />
            {plan ? `On ${TIER_PLANS[plan].name} and up` : 'See plans'}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-text-secondary leading-relaxed">
          Not enough trades in {periodLabel} to rank yet. This fills in as the month does.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((f) => (
            <li key={`${f.dimension}-${f.subject}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5 text-[13px] leading-snug">
              <span className={`text-right font-bold tabular-nums ${f.pnl < 0 ? 'text-loss-bright' : 'text-profit-bright'}`}>
                {formatCurrencyCompact(f.pnl, settings.currency)}
              </span>
              <span>
                {f.subject.charAt(0).toUpperCase() + f.subject.slice(1)}
                <span className="block text-[11px] text-text-secondary">
                  {f.count} {f.count === 1 ? f.unit.slice(0, -1) : f.unit} · {f.pnl < 0 ? 'cost you' : 'made you'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
