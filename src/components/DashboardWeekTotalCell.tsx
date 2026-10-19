import type { WeekSummary } from '../types';
import { useSettings } from '../context/useSettings';
import { formatCurrency } from '../utils/format';

interface DashboardWeekTotalCellProps {
  summary: WeekSummary;
  /** 0–1: this week's absolute P&L against the month's biggest week. Draws the bar. */
  share?: number;
}

/**
 * The week's figure, as the number it is, in the calendar's last column on desktop.
 *
 * For anyone who reviews by the week this is the most useful number on the grid. The column header
 * says what the column is, so there is no label; the figure is the biggest thing in the cell, and a
 * bar under it shows the week's size against the month's biggest — the colour says which way, the
 * length says how much. The column is a fixed 96px so a four-figure week always has room for its
 * cents, whatever the width of the days beside it.
 */
export function DashboardWeekTotalCell({ summary, share = 0 }: DashboardWeekTotalCellProps) {
  const { settings } = useSettings();

  // A week with no trades gets nothing: a label repeated down every unused row read as an
  // unfinished placeholder rather than as a label.
  if (summary.tradeCount === 0) return <div className="h-16" aria-hidden />;

  const isProfit = summary.totalPnl >= 0;
  return (
    <div className="flex h-16 flex-col justify-center gap-1 rounded-[9px] border border-white/[0.06] bg-bg-tertiary px-2.5 py-1.5">
      <span className={`block truncate text-sm font-bold leading-tight tabular-nums ${isProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
        {formatCurrency(summary.totalPnl, settings.currency)}
      </span>
      <span className="block h-[3px] w-full overflow-hidden rounded-full bg-[#222]" aria-hidden>
        <span className={`block h-full rounded-full ${isProfit ? 'bg-profit-bright' : 'bg-loss-bright'}`} style={{ width: `${Math.round(Math.max(0.08, share) * 100)}%` }} />
      </span>
      <span className="block truncate text-[10px] text-text-secondary">
        {summary.tradeCount} {summary.tradeCount === 1 ? 'trade' : 'trades'}
      </span>
    </div>
  );
}
