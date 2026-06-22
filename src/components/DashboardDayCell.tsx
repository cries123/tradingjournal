import type { DailySummary } from '../types';
import { formatCurrency } from '../utils/format';

interface DashboardDayCellProps {
  dayNumber: number | null;
  summary: DailySummary | null;
  onClick?: () => void;
}

export function DashboardDayCell({ dayNumber, summary, onClick }: DashboardDayCellProps) {
  if (dayNumber === null) {
    return <div className="min-h-[88px] rounded-lg bg-bg-card/40" />;
  }

  const hasTrades = summary && summary.tradeCount > 0;
  const isProfit = hasTrades && summary.totalPnl >= 0;
  const isLoss = hasTrades && summary.totalPnl < 0;

  const borderClass = isProfit
    ? 'border-profit-bright/60 ring-1 ring-profit-bright/20'
    : isLoss
      ? 'border-loss-bright/60 ring-1 ring-loss-bright/20'
      : 'border-border/40';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasTrades}
      className={`min-h-[88px] p-3 rounded-lg text-left transition-all flex flex-col bg-bg-card border ${borderClass} ${
        hasTrades ? 'hover:bg-bg-tertiary cursor-pointer' : 'cursor-default opacity-80'
      }`}
    >
      <span className="text-xs text-text-secondary">{dayNumber}</span>
      {hasTrades ? (
        <div className="mt-auto">
          <span
            className={`text-base font-bold leading-tight block ${
              isProfit ? 'text-profit-bright' : 'text-loss-bright'
            }`}
          >
            {formatCurrency(summary.totalPnl)}
          </span>
          <span className="text-[11px] text-text-secondary mt-0.5 block">
            {summary.tradeCount} {summary.tradeCount === 1 ? 'trade' : 'trades'}
          </span>
        </div>
      ) : null}
    </button>
  );
}
