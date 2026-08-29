import type { WeekSummary } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';

interface DashboardWeekTotalCellProps {
  summary: WeekSummary;
  /** Matches the compact mode on the day cells beside it, so the row stays aligned. */
  compact?: boolean;
}

const cellShell = 'rounded-sm md:rounded-lg text-left flex flex-col overflow-hidden border';

const FULL_HEIGHT = 'aspect-square md:aspect-auto md:h-[108px]';
const COMPACT_HEIGHT = 'h-7 md:h-11';

export function DashboardWeekTotalCell({ summary, compact = false }: DashboardWeekTotalCellProps) {
  const { settings } = useSettings();
  const heightClass = compact ? COMPACT_HEIGHT : FULL_HEIGHT;

  // A week with no trades gets an empty tile, not the words "Week total". The column header
  // already says what the column is; repeating it down every unused row read as an unfinished
  // placeholder rather than as a label.
  if (summary.tradeCount === 0) {
    return (
      <div
        className={`${cellShell} ${heightClass} p-0.5 md:p-2 bg-bg-tertiary/20 border-border/30 justify-center items-center`}
        aria-hidden
      />
    );
  }

  const isProfit = summary.totalPnl >= 0;

  return (
    <div
      className={`${cellShell} ${heightClass} p-0.5 md:p-2 bg-accent/[0.06] ${
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
