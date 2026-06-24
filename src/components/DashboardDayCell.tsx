import type { DailySummary } from '../types';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';

interface DashboardDayCellProps {
  dayNumber: number | null;
  summary: DailySummary | null;
  onClick?: () => void;
}

const cellShell =
  'rounded-sm md:rounded-lg text-left transition-all flex flex-col bg-bg-card overflow-hidden aspect-square md:aspect-auto md:h-[72px]';

export function DashboardDayCell({ dayNumber, summary, onClick }: DashboardDayCellProps) {
  if (dayNumber === null) {
    return <div className={`${cellShell} bg-bg-card/40 border border-transparent`} />;
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
      className={`${cellShell} p-0.5 md:p-2 border ${borderClass} hover:bg-bg-tertiary cursor-pointer group`}
    >
      <span className="text-[9px] md:text-xs text-text-secondary leading-none">{dayNumber}</span>
      {hasTrades ? (
        <div className="mt-auto min-w-0 w-full">
          <span
            className={`text-[9px] md:text-sm font-bold leading-tight block truncate ${
              isProfit ? 'text-profit-bright' : 'text-loss-bright'
            }`}
          >
            <span className="md:hidden">{formatCurrencyCompact(summary.totalPnl)}</span>
            <span className="hidden md:inline">{formatCurrency(summary.totalPnl)}</span>
          </span>
          <span className="hidden md:block text-[10px] text-text-secondary mt-0.5 truncate">
            {summary.tradeCount} {summary.tradeCount === 1 ? 'trade' : 'trades'}
          </span>
        </div>
      ) : (
        <span className="mt-auto hidden md:block text-[10px] text-text-secondary/0 group-hover:text-text-secondary transition-colors">
          + import
        </span>
      )}
    </button>
  );
}
