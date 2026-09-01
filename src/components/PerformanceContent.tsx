import { useMemo, useState } from 'react';
import { ArrowLeft, Gauge } from 'lucide-react';
import type { Trade } from '../types';
import { getMonthTrades, getYearTrades } from '../utils/stats';
import { ExecutionSection } from './analytics/ExecutionSection';

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
 * These five panels came off the dashboard on purpose. The calendar is a daily glance; "which of
 * my setups actually makes money" is something a trader sits down to look at, and stacking the two
 * made a page nobody scrolled to the bottom of.
 *
 * Being a destination also changes what an empty panel means. On the dashboard a panel with no
 * data had to disappear, because an empty card on a screen you opened for another reason reads as
 * a broken product. Here the reader came looking for exactly this, so a panel that cannot be drawn
 * is the most useful thing on the page: it names the one field that would unlock it.
 */
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

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
          How you traded, rather than how much you made. Every panel here reads a field the journal
          already collects — and says what to record when it can&apos;t draw one yet.
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
            <ExecutionSection trades={scoped} showPrompts />
          </>
        )}
      </div>
    </div>
  );
}
