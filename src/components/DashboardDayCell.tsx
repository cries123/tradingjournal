import type { DailySummary } from '../types';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';

interface DashboardDayCellProps {
  dayNumber: number | null;
  summary: DailySummary | null;
  onClick?: () => void;
}

export function DashboardDayCell({ dayNumber, summary, onClick }: DashboardDayCellProps) {
  if (dayNumber === null) {
    return <div className="aspect-square md:min-h-[52px] rounded-sm md:rounded-md bg-bg-card/40" />;
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
      className={`aspect-square md:aspect-auto md:min-h-[52px] p-0.5 md:p-1.5 rounded-sm md:rounded-md text-left transition-all flex flex-col bg-bg-card border ${borderClass} hover:bg-bg-tertiary cursor-pointer group overflow-hidden`}
    >
      <span className="text-[9px] md:text-[10px] text-text-secondary leading-none">{dayNumber}</span>
      {hasTrades ? (
        <div className="mt-auto min-w-0 w-full">
          <span
            className={`text-[9px] md:text-xs font-bold leading-none block truncate ${
              isProfit ? 'text-profit-bright' : 'text-loss-bright'
            }`}
          >
            <span className="md:hidden">{formatCurrencyCompact(summary.totalPnl)}</span>
            <span className="hidden md:inline">{formatCurrency(summary.totalPnl)}</span>
          </span>
          <span className="hidden md:block text-[9px] text-text-secondary mt-0.5 truncate">
            {summary.tradeCount} {summary.tradeCount === 1 ? 'trade' : 'trades'}
          </span>
        </div>
      ) : (
        <span className="mt-auto hidden md:block text-[9px] text-text-secondary/0 group-hover:text-text-secondary transition-colors">
          + import
        </span>
      )}
    </button>
  );
}
