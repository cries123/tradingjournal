import type { DailyPnlPoint } from '../utils/stats';
import { formatCurrency } from '../utils/format';

interface DailyPnlChartProps {
  data: DailyPnlPoint[];
}

export function DailyPnlChart({ data }: DailyPnlChartProps) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-secondary">
        No daily data this month
      </div>
    );
  }

  return (
    <div className="h-full flex items-end gap-1 px-1">
      {data.map((point) => {
        const heightPct = (Math.abs(point.pnl) / maxAbs) * 100;
        const isProfit = point.pnl >= 0;
        return (
          <div key={point.date} className="flex-1 flex flex-col items-center gap-0.5 min-w-0 h-full">
            <span className={`text-[9px] font-medium truncate w-full text-center ${isProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {formatCurrency(point.pnl)}
            </span>
            <div className="w-full flex-1 flex items-end justify-center min-h-0">
              <div
                className={`w-full max-w-[28px] rounded-t-sm transition-all ${isProfit ? 'bg-profit-bright' : 'bg-loss-bright'}`}
                style={{ height: `${Math.max(heightPct, 4)}%` }}
              />
            </div>
            <span className="text-[9px] text-text-secondary">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}
