import { useMemo, useState } from 'react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/format';
import { useLiveBenchmark } from '../../hooks/useLiveBenchmark';
import {
  buildEquityCurve,
  computeDrawdown,
  computeTagStats,
  computeSessionStats,
  runMonteCarlo,
  checkRuleViolations,
  buildRoundTrips,
  totalFees,
} from '../../utils/advancedStats';
import { EquityCurveChart } from './EquityCurveChart';
import { TagAnalyticsTable } from './TagAnalyticsTable';
import { TimeOfDayChart } from './TimeOfDayChart';
import { RoundTripsPanel } from './RoundTripsPanel';
import { MonteCarloPanel } from './MonteCarloPanel';

type AnalyticsTab = 'equity' | 'tags' | 'sessions' | 'roundtrips' | 'simulation';

const TABS: { id: AnalyticsTab; label: string }[] = [
  { id: 'equity', label: 'Equity & DD' },
  { id: 'tags', label: 'Tags' },
  { id: 'sessions', label: 'Time of day' },
  { id: 'roundtrips', label: 'Round trips' },
  { id: 'simulation', label: 'Monte Carlo' },
];

interface AdvancedAnalyticsSectionProps {
  trades: Trade[];
}

export function AdvancedAnalyticsSection({ trades }: AdvancedAnalyticsSectionProps) {
  const { settings } = useSettings();
  const [tab, setTab] = useState<AnalyticsTab>('equity');
  const { quote: liveBenchmark } = useLiveBenchmark(settings.benchmarkSymbol, settings.liveBenchmarkEnabled);

  const curve = useMemo(() => buildEquityCurve(trades), [trades]);
  const drawdown = useMemo(() => computeDrawdown(curve), [curve]);
  const tagStats = useMemo(() => computeTagStats(trades), [trades]);
  const sessionStats = useMemo(() => computeSessionStats(trades), [trades]);
  const roundTrips = useMemo(() => buildRoundTrips(trades), [trades]);
  const monteCarlo = useMemo(() => runMonteCarlo(trades), [trades]);
  const violations = useMemo(
    () => checkRuleViolations(trades, settings.tradingRules),
    [trades, settings.tradingRules],
  );
  const fees = useMemo(() => totalFees(trades), [trades]);

  if (trades.length === 0) return null;

  const netReturnPct =
    curve.length > 0 && drawdown.peakEquity !== 0
      ? ((curve[curve.length - 1].equity / Math.max(Math.abs(drawdown.peakEquity), 1)) * 100 - 100).toFixed(1)
      : '0';

  const benchmarkPct = settings.liveBenchmarkEnabled && liveBenchmark
    ? liveBenchmark.monthToDateReturnPct
    : settings.benchmarkReturnPct;

  const alphaLabel =
    benchmarkPct != null && benchmarkPct !== 0
      ? `${(Number(netReturnPct) - benchmarkPct).toFixed(1)}% alpha`
      : settings.liveBenchmarkEnabled
        ? 'Loading benchmark…'
        : 'Set in Settings';

  return (
    <section className="panel-card p-3 md:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-medium">Advanced analytics</p>
          <h3 className="text-sm md:text-base font-semibold">Performance deep dive</h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 rounded-md text-[10px] md:text-xs font-medium transition-colors focus-ring ${
                tab === t.id ? 'bg-emerald-500/15 text-emerald-300' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric label="Max drawdown" value={formatCurrency(-drawdown.maxDrawdown, settings.currency)} loss />
        <Metric label="Peak equity" value={formatCurrency(drawdown.peakEquity, settings.currency)} />
        <Metric label="Total fees" value={formatCurrency(fees, settings.currency)} />
        <Metric
          label={`vs ${settings.benchmarkSymbol}`}
          value={alphaLabel}
        />
      </div>

      {settings.tradingRules.enabled && violations.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1">
          <p className="text-xs font-semibold text-amber-300">Rule violations ({violations.length})</p>
          {violations.slice(0, 3).map((v) => (
            <p key={`${v.date}-${v.type}`} className="text-[10px] text-text-secondary">
              {v.date}: {v.message}
            </p>
          ))}
        </div>
      )}

      {tab === 'equity' && <EquityCurveChart data={curve} maxDrawdown={drawdown.maxDrawdown} />}
      {tab === 'tags' && <TagAnalyticsTable stats={tagStats} />}
      {tab === 'sessions' && <TimeOfDayChart data={sessionStats} />}
      {tab === 'roundtrips' && <RoundTripsPanel trips={roundTrips} />}
      {tab === 'simulation' && <MonteCarloPanel result={monteCarlo} tradeCount={trades.length} />}
    </section>
  );
}

function Metric({ label, value, loss }: { label: string; value: string; loss?: boolean }) {
  return (
    <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${loss ? 'text-loss-bright' : 'text-text-primary'}`}>{value}</p>
    </div>
  );
}
