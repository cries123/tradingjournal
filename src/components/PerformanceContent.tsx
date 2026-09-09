import { useMemo, useState } from 'react';
import { ArrowLeft, Gauge } from 'lucide-react';
import type { Trade } from '../types';
import { getMonthTrades, getYearTrades } from '../utils/stats';
import { ExecutionPrompts, ExecutionSection } from './analytics/ExecutionSection';
import { BrokerInsightSection } from './analytics/BrokerInsightSection';
import { hasAnyExecutionData, executionCoverage } from '../utils/executionAnalytics';

type Scope = 'month' | 'year' | 'all';

interface PerformanceContentProps {
  trades: Trade[];
  year: number;
  month: number;
  onBack: () => void;
}

/**
 * Execution analysis, on a screen of its own.
 *
 * These panels came off the dashboard on purpose. The calendar is a daily glance; "which of my
 * setups actually makes money" is something a trader sits down to look at, and stacking the two
 * made a page nobody scrolled to the bottom of.
 *
 * The screen is in two halves now, and the split is the point. Everything under "What you traded"
 * is computed from a broker import alone — size, sequence, fees, expiry, the win rate the payoff
 * ratio demands — so a person who has only ever pressed Sync lands on a full page. Everything
 * under "What you recorded" needs a field somebody typed, and only appears once they have.
 *
 * The version before this had it backwards: six panels, five of which needed hand-entered fields,
 * so a Schwab account with three hundred imported trades opened a paid screen and found one panel
 * and five dashed rectangles explaining what it could not do. The fields are still worth
 * recording and the page still says so — once, at the bottom, rather than as most of its surface.
 */
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

function SectionHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mt-5 mb-2.5 first:mt-0">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5 max-w-xl">{blurb}</p>
    </div>
  );
}

export function PerformanceContent({ trades, year, month, onBack }: PerformanceContentProps) {
  /* Defaults to the year rather than the month, unlike the dashboard. Every panel here needs a
     sample before it will say anything, and a month of trading often does not clear it — landing
     on a screen of locked panels would misrepresent how much of this a person has already earned. */
  const [scope, setScope] = useState<Scope>('year');

  const scoped = useMemo(() => {
    if (scope === 'month') return getMonthTrades(trades, year, month);
    if (scope === 'year') return getYearTrades(trades, year);
    return trades;
  }, [trades, scope, year, month]);

  /* Whether the second section has anything in it at all. Asked here rather than inside the
     section so the heading above it can be suppressed too — a heading over nothing is the same
     empty-card problem in smaller type. */
  const recorded = useMemo(() => hasAnyExecutionData(executionCoverage(scoped)), [scoped]);

  return (
    <div className="pb-6">
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-6 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Gauge size={22} />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Performance</h1>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-bg-tertiary/60 p-0.5">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                aria-pressed={scope === s.id}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-ring ${
                  scope === s.id
                    ? 'bg-bg-secondary text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-text-secondary mb-7 leading-relaxed max-w-2xl">
          How you traded, rather than how much you made. Everything in the first section is worked
          out from your imported fills alone — nothing to fill in.
        </p>

        {trades.length === 0 ? (
          <div className="panel-card p-10 text-center">
            <p className="text-sm text-text-secondary">
              Nothing to analyse yet. Import from a broker or add a trade and this fills in.
            </p>
          </div>
        ) : scoped.length === 0 ? (
          <div className="panel-card p-10 text-center">
            <p className="text-sm text-text-secondary">
              No trades in this period. Try a wider one.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-secondary mb-3 tabular-nums">
              {scoped.length} trade{scoped.length === 1 ? '' : 's'} in view
            </p>

            <SectionHeading
              title="What you traded"
              blurb="Worked out from the fills themselves — size, order, costs and expiry. No fields to fill in."
            />
            <BrokerInsightSection trades={scoped} />

            {recorded && (
              <>
                <SectionHeading
                  title="What you recorded"
                  blurb="Panels that read the fields you fill in yourself, plus the tickers, which need nothing."
                />
                <ExecutionSection trades={scoped} />
              </>
            )}

            <div className="mt-4 md:mt-5">
              <ExecutionPrompts trades={scoped} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
