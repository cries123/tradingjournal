import { useSettings } from '../../context/SettingsContext';
import type { EquityPoint } from '../../utils/advancedStats';
import { formatCurrency } from '../../utils/format';

interface EquityCurveChartProps {
  data: EquityPoint[];
  maxDrawdown: number;
}

export function EquityCurveChart({ data, maxDrawdown }: EquityCurveChartProps) {
  const { settings } = useSettings();

  if (data.length === 0) {
    return <p className="text-xs text-text-secondary">No equity data yet.</p>;
  }

  const values = data.map((d) => d.equity);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-28 md:h-36">
        {data.map((point) => {
          const height = ((point.equity - min) / range) * 100;
          const positive = point.equity >= 0;
          return (
            <div
              key={point.date}
              title={`${point.date}: ${formatCurrency(point.equity, settings.currency)}`}
              className={`flex-1 min-w-0 rounded-t chart-bar ${positive ? 'bg-profit-bright/80' : 'bg-loss-bright/80'}`}
              style={{ height: `${Math.max(4, height)}%` }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-text-secondary">
        Cumulative equity · max drawdown {formatCurrency(-maxDrawdown, settings.currency)}
      </p>
    </div>
  );
}
