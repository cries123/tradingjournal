import type { DailyPnlPoint } from '../utils/stats';
import { formatCurrency } from '../utils/format';

interface DailyPnlChartProps {
  data: DailyPnlPoint[];
}

export function DailyPnlChart({ data }: DailyPnlChartProps) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-text-secondary">
        No daily data this month
      </div>
    );
  }

  return (
    <div className="h-52 flex items-end gap-2 px-2">
      {data.map((point) => {
        const heightPct = (Math.abs(point.pnl) / maxAbs) * 100;
        const isProfit = point.pnl >= 0;
        return (
          <div key={point.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className={`text-[10px] font-medium truncate w-full text-center ${isProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {formatCurrency(point.pnl)}
            </span>
            <div className="w-full flex-1 flex items-end justify-center min-h-[120px]">
              <div
                className={`w-full max-w-[40px] rounded-t-md transition-all ${isProfit ? 'bg-profit-bright' : 'bg-loss-bright'}`}
                style={{ height: `${Math.max(heightPct, 4)}%` }}
              />
            </div>
            <span className="text-[10px] text-text-secondary">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}
