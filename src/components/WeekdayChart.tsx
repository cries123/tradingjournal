import { useEffect, useState } from 'react';
import type { WeekdayPnlPoint } from '../utils/stats';
import { formatCurrency } from '../utils/format';

interface WeekdayChartProps {
  data: WeekdayPnlPoint[];
}

export function WeekdayChart({ data }: WeekdayChartProps) {
  const [animate, setAnimate] = useState(false);
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  const hasData = data.some((d) => d.pnl !== 0);

  useEffect(() => {
    setAnimate(false);
    const t = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(t);
  }, [data]);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-secondary">
        No weekday data this month
      </div>
    );
  }

  return (
    <div className="space-y-1 h-full flex flex-col justify-center">
      {data.map((point, i) => {
        const widthPct = (Math.abs(point.pnl) / maxAbs) * 100;
        const isProfit = point.pnl >= 0;
        return (
          <div key={point.label} className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-secondary w-7 shrink-0">{point.label}</span>
            <div className="flex-1 h-3.5 bg-bg-primary rounded overflow-hidden relative">
              {point.pnl !== 0 && (
                <div
                  className={`h-full rounded chart-bar-h ${isProfit ? 'bg-profit-bright' : 'bg-loss-bright'}`}
                  style={{
                    width: animate ? `${Math.max(widthPct, 2)}%` : '0%',
                    transitionDelay: `${i * 50}ms`,
                  }}
                />
              )}
            </div>
            <span className={`text-[10px] font-medium w-16 text-right shrink-0 ${point.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {point.pnl !== 0 ? formatCurrency(point.pnl) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
