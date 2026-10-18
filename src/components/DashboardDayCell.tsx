import { AlertTriangle } from 'lucide-react';
import type { DailySummary } from '../types';
import { useSettings } from '../context/useSettings';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';

interface DashboardDayCellProps {
  dayNumber: number | null;
  summary: DailySummary | null;
  onClick?: () => void;
  /** 0–1 relative magnitude of this day's P&L vs the month's biggest day. */
  intensity?: number;
  isToday?: boolean;
  /** Shrink to a slim row. Set for whole weeks with no trades, so a month that starts mid-week
   *  doesn't spend two full-height rows of the page saying nothing. */
  compact?: boolean;
  /** This day just gained its first trade — a sync or an import landed on it. It pops in. */
  fresh?: boolean;
  /**
   * One of the trader's own rules was broken on this day — over the trade cap, past the daily
   * loss limit. A month's discipline should read off the grid, not only off the breach list.
   */
  ruleBroken?: boolean;
}

const cellShell =
  'rounded-sm md:rounded-lg text-left transition-all duration-200 ease-out motion-reduce:transition-none flex flex-col bg-bg-card overflow-hidden motion-safe:hover:scale-[1.03] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98]';

const FULL_HEIGHT = 'aspect-square md:aspect-auto md:h-[108px]';
const COMPACT_HEIGHT = 'h-7 md:h-11';

export function DashboardDayCell({
  dayNumber,
  summary,
  onClick,
  intensity = 0,
  isToday = false,
  compact = false,
  fresh = false,
  ruleBroken = false,
}: DashboardDayCellProps) {
  const { settings } = useSettings();
  const heightClass = compact ? COMPACT_HEIGHT : FULL_HEIGHT;

  if (dayNumber === null) {
    return <div className={`${cellShell} ${heightClass} bg-bg-card/40 border border-transparent`} />;
  }

  const hasTrades = summary && summary.tradeCount > 0;
  const isProfit = hasTrades && summary.totalPnl >= 0;
  const isLoss = hasTrades && summary.totalPnl < 0;

  const borderClass = isProfit
    ? 'border-profit-bright/50 ring-1 ring-profit-bright/15 shadow-sm shadow-profit-bright/10'
    : isLoss
      ? 'border-loss-bright/50 ring-1 ring-loss-bright/15 shadow-sm shadow-loss-bright/10'
      : 'border-border/40';

  // Heat-map tint: bigger days glow harder. Reads the live theme accent via the
  // --color-profit-bright-rgb custom property (set in index.css / kept in sync by
  // SettingsContext) so the heat-map recolors along with everything else.
  const alpha = hasTrades ? 0.06 + intensity * 0.22 : 0;
  const heatStyle = isProfit
    ? { background: `linear-gradient(160deg, rgba(var(--color-profit-bright-rgb), ${alpha}), rgba(var(--color-profit-bright-rgb), ${alpha * 0.25}))` }
    : isLoss
      ? { background: `linear-gradient(160deg, rgba(248, 113, 113, ${alpha}), rgba(248, 113, 113, ${alpha * 0.25}))` }
      : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      style={heatStyle}
      className={`${cellShell} ${heightClass} p-0.5 md:p-2 border ${borderClass} ${
        isToday ? 'day-today' : ''
      } ${fresh ? 'animate-cell-pop' : ''} hover:bg-bg-tertiary cursor-pointer group focus-ring`}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={`text-[9px] md:text-xs leading-none ${
            isToday ? 'text-accent font-semibold' : 'text-text-secondary'
          }`}
        >
          {dayNumber}
        </span>
        {ruleBroken && !compact && (
          /* Amber, like the rule banner: the one colour on the grid that is neither win nor loss,
             so a broken rule on a green day still reads as a broken rule. */
          <span
            className="grid h-3 w-3 md:h-4 md:w-4 shrink-0 place-items-center rounded-full bg-amber-400/20 text-amber-300"
            title="Broke one of your rules"
            aria-label="Broke one of your rules"
          >
            <AlertTriangle size={9} className="md:hidden" aria-hidden />
            <AlertTriangle size={11} className="hidden md:block" aria-hidden />
          </span>
        )}
      </span>
      {hasTrades && !compact ? (
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
      ) : (
        !compact && (
          <span className="mt-auto hidden md:block text-[10px] text-text-secondary/0 group-hover:text-text-secondary transition-colors">
            + import
          </span>
        )
      )}
    </button>
  );
}
