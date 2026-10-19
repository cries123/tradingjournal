import type { WeekSummary } from '../types';
import { useSettings } from '../context/useSettings';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';

interface DashboardWeekTotalCellProps {
  summary: WeekSummary;
  /** Matches the compact mode on the day cells beside it, so the row stays aligned. */
  compact?: boolean;
  /** 0–1: this week's absolute P&L against the month's biggest week. Draws the bar. */
  share?: number;
}

const cellShell = 'rounded-sm md:rounded-lg text-left flex flex-col overflow-hidden border';

const FULL_HEIGHT = 'aspect-square md:aspect-auto md:h-[108px]';
const COMPACT_HEIGHT = 'h-7 md:h-11';

/**
 * The week's figure, as the number it is.
 *
 * For anyone who reviews by the week this is the most useful number on the grid, and it was drawn
 * as a tinted cell with a "Week total" label over a figure the size of a day's. The column header
 * already says what the column is, so the label is gone; the figure is the biggest thing in the
 * cell, and a bar under it shows the week's size against the month's biggest — the colour says
 * which way, the length says how much.
 */
export function DashboardWeekTotalCell({ summary, compact = false, share = 0 }: DashboardWeekTotalCellProps) {
  const { settings } = useSettings();
  const heightClass = compact ? COMPACT_HEIGHT : FULL_HEIGHT;

  // A week with no trades gets an empty tile. Repeating a label down every unused row read as an
  // unfinished placeholder rather than as a label.
  if (summary.tradeCount === 0) {
    return (
      <div
        className={`${cellShell} ${heightClass} p-0.5 md:p-2 bg-bg-tertiary/20 border-border/30 justify-center items-center`}
        aria-hidden
      />
    );
  }

  const isProfit = summary.totalPnl >= 0;
  const tone = isProfit ? 'text-profit-bright' : 'text-loss-bright';
  const bar = isProfit ? 'bg-profit-bright' : 'bg-loss-bright';

  return (
    <div
      className={`${cellShell} ${heightClass} p-0.5 md:p-2 bg-white/[0.03] justify-end ${
        isProfit ? 'border-profit-bright/30' : 'border-loss-bright/30'
      }`}
    >
      {/* Three widths, three forms. A phone always gets the short form. From xl to 2xl the Overview
          gives a column to the rail beside the calendar and this cell is about 75px of text, where
          "-$1,174.66" at full size ran out of room and printed as "-$1,17…" — so there a four-figure
          week is "-$1.2k", and anything smaller still gets its cents. */}
      <span className={`block truncate font-bold leading-tight tabular-nums text-[10px] md:text-lg xl:text-base 2xl:text-lg ${tone}`}>
        <span className="md:hidden">{formatCurrencyCompact(summary.totalPnl, settings.currency)}</span>
        <span className="hidden md:inline xl:hidden 2xl:inline">{formatCurrency(summary.totalPnl, settings.currency)}</span>
        <span className="hidden xl:inline 2xl:hidden">
          {Math.abs(summary.totalPnl) >= 1000
            ? formatCurrencyCompact(summary.totalPnl, settings.currency)
            : formatCurrency(summary.totalPnl, settings.currency)}
        </span>
      </span>
      <span className="hidden md:block text-[10px] text-text-secondary mt-0.5 truncate">
        {summary.tradeCount} {summary.tradeCount === 1 ? 'trade' : 'trades'}
      </span>
      {!compact && (
        <span className="mt-1 md:mt-1.5 block h-[3px] md:h-1 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          <span className={`block h-full rounded-full ${bar}`} style={{ width: `${Math.round(Math.max(0.08, share) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}
