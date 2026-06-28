import { useSettings } from '../../context/SettingsContext';
import type { MonteCarloResult } from '../../utils/advancedStats';
import { formatCurrency } from '../../utils/format';

interface MonteCarloPanelProps {
  result: MonteCarloResult;
  tradeCount: number;
}

export function MonteCarloPanel({ result, tradeCount }: MonteCarloPanelProps) {
  const { settings } = useSettings();

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <Stat label="Simulations" value="500" />
      <Stat label="Sample size" value={String(tradeCount)} />
      <Stat label="Median outcome" value={formatCurrency(result.medianEndingEquity, settings.currency)} />
      <Stat label="Best case" value={formatCurrency(result.bestCase, settings.currency)} />
      <Stat label="Worst case" value={formatCurrency(result.worstCase, settings.currency)} />
      <Stat label="Risk of ruin" value={`${result.riskOfRuinPct.toFixed(1)}%`} />
      <p className="col-span-2 text-[10px] text-text-secondary mt-1">
        Shuffles your trade P&L sequence 500 times to estimate outcome range. Not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
