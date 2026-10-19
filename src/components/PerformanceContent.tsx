import { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import type { Trade } from '../types';
import { useSettings } from '../context/useSettings';
import { getMonthTrades, getYearTrades } from '../utils/stats';
import { formatMonthYear } from '../utils/format';
import { ExecutionPrompts, ExecutionSection } from './analytics/ExecutionSection';
import { BrokerInsightSection } from './analytics/BrokerInsightSection';
import { PerformanceVerdict } from './analytics/PerformanceVerdict';
import { hasAnyExecutionData, executionCoverage } from '../utils/executionAnalytics';
import { PageFrame, PageSection } from './layout/PageFrame';
import { SegmentedControl } from './ui/SegmentedControl';

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
 * The screen opens with the verdict — the biggest drain, the biggest engine and the one change —
 * because twelve panels each ending in a sentence of their own never said what the page as a whole
 * said, and the reader had to find the $4,000 finding among the $300 ones. Under it, two halves:
 * everything under "What you traded" is computed from a broker import alone — size, sequence, fees,
 * expiry, the win rate the payoff ratio demands — so a person who has only ever pressed Sync lands
 * on a full page. Everything under "What you recorded" needs a field somebody typed, and only
 * appears once they have.
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

export function PerformanceContent({ trades, year, month, onBack }: PerformanceContentProps) {
  const { settings } = useSettings();
  /* Defaults to the year rather than the month, unlike the dashboard. Every panel here needs a
     sample before it will say anything, and a month of trading often does not clear it — landing
     on a screen of locked panels would misrepresent how much of this a person has already earned. */
  const [scope, setScope] = useState<Scope>('year');

  const scoped = useMemo(() => {
    if (scope === 'month') return getMonthTrades(trades, year, month);
    if (scope === 'year') return getYearTrades(trades, year);
    return trades;
  }, [trades, scope, year, month]);

  /*
   * The period, named on every heading. The Overview reads the month and this screen opens on the
   * year, so the two showed different break-even figures with nothing saying why; a reader took it
   * for a bug. The toggle at the top says which period, but it has scrolled away by the time
   * anyone reads a figure.
   */
  const periodLabel = scope === 'month' ? formatMonthYear(year, month) : scope === 'year' ? String(year) : 'All time';

  /* Whether the second section has anything in it at all. Asked here rather than inside the
     section so the heading above it can be suppressed too — a heading over nothing is the same
     empty-card problem in smaller type. */
  const recorded = useMemo(() => hasAnyExecutionData(executionCoverage(scoped)), [scoped]);

  return (
    <PageFrame
      sidebarDestination
      title="Performance"
      icon={Gauge}
      onBack={onBack}
      subtitle="How you traded, rather than how much you made. Everything in the first section is worked out from your imported fills alone — nothing to fill in."
      actions={
        <SegmentedControl label="Period" value={scope} onChange={setScope} options={SCOPES} />
      }
    >
      {trades.length === 0 ? (
        <div className="panel-card p-10 text-center">
          <p className="text-sm text-text-secondary">
            Nothing to analyse yet. Import from a broker or add a trade and this fills in.
          </p>
        </div>
      ) : scoped.length === 0 ? (
        <div className="panel-card p-10 text-center">
          <p className="text-sm text-text-secondary">No trades in this period. Try a wider one.</p>
        </div>
      ) : (
        <>
          <PerformanceVerdict trades={scoped} currency={settings.currency} periodLabel={periodLabel} />

          <PageSection
            title={`What you traded · ${periodLabel} · ${scoped.length} trade${scoped.length === 1 ? '' : 's'}`}
            blurb="Worked out from the fills themselves — size, order, costs and expiry. No fields to fill in. Biggest finding first."
          >
            <BrokerInsightSection trades={scoped} />
          </PageSection>

          {recorded && (
            <PageSection
              title={`What you recorded · ${periodLabel}`}
              blurb="Panels that read the fields you fill in yourself, plus the tickers, which need nothing."
            >
              <ExecutionSection trades={scoped} />
            </PageSection>
          )}

          <ExecutionPrompts trades={scoped} />
        </>
      )}
    </PageFrame>
  );
}
