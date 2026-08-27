import type { WeekSummary } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';

interface DashboardWeekTotalCellProps {
  summary: WeekSummary;
}

const cellShell =
  'rounded-sm md:rounded-lg text-left flex flex-col overflow-hidden aspect-square md:aspect-auto md:h-[108px] border';

export function DashboardWeekTotalCell({ summary }: DashboardWeekTotalCellProps) {
  const { settings } = useSettings();

  if (summary.tradeCount === 0) {
    return (
      <div className={`${cellShell} p-0.5 md:p-2 bg-bg-tertiary/20 border-border/30 justify-center items-center`}>
        <span className="text-[7px] md:text-[9px] text-text-secondary/50 uppercase tracking-wide text-center">
          <span className="md:hidden">Tot</span>
          <span className="hidden md:inline">Week total</span>
        </span>
      </div>
    );
  }

  const isProfit = summary.totalPnl >= 0;

  return (
    <div
      className={`${cellShell} p-0.5 md:p-2 bg-accent/[0.06] ${
        isProfit ? 'border-profit-bright/30' : 'border-red-500/30'
      }`}
    >
      <span className="text-[7px] md:text-[10px] text-accent/80 uppercase tracking-wide leading-none font-medium">
        <span className="md:hidden">Tot</span>
        <span className="hidden md:inline">Week total</span>
      </span>
      <div className="mt-auto min-w-0 w-full">
        <span
          className={`text-[9px] md:text-sm font-bold leading-tight block truncate ${
            isProfit ? 'text-profit-bright' : 'text-loss-bright'
          }`}
        >
          <span className="md:hidden">{formatCurrencyCompact(summary.totalPnl, settings.currency)}</span>
          <span className="hidden md:inline">{formatCurrency(summary.totalPnl, settings.currency)}</span>
        </span>
        <span className="hidden md:block text-[10px] text-text-secondary mt-0.5 truncate">
          {summary.tradeCount} {summary.tradeCount === 1 ? 'trade' : 'trades'}
        </span>
      </div>
    </div>
  );
}
