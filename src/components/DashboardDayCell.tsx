import type { DailySummary } from '../types';
import { useSettings } from '../context/useSettings';
import { formatCurrency } from '../utils/format';

interface DashboardDayCellProps {
  dayNumber: number | null;
  summary: DailySummary | null;
  onClick?: () => void;
  isToday?: boolean;
  /** This day just gained its first trade — a sync or an import landed on it. It pops in. */
  fresh?: boolean;
  /**
   * One of the trader's own rules was broken on this day — over the trade cap, past the daily
   * loss limit. A month's discipline should read off the grid, not only off the breach list.
   */
  ruleBroken?: boolean;
  /** The phone's smaller cell: whole dollars, and a dot for a broken rule. */
  size?: 'desktop' | 'phone';
}

/** "−$591", "+$454" — what fits a 50px phone cell; the cents are on the day itself. */
function wholeDollars(n: number, currency: Parameters<typeof formatCurrency>[1]): string {
  const text = formatCurrency(Math.round(n), currency).replace(/\.00$/, '');
  return n > 0 ? `+${text}` : text;
}

/**
 * One day of the calendar.
 *
 * Drawn flat — a tint and a border in the day's colour, the figure, the count — rather than the
 * heat-map gradient it had, which made a $40 day and a $4,000 day hard to tell apart from the
 * colour alone while the figure in it said exactly that. Amber marks a broken rule, the one colour
 * on the grid that is neither win nor loss, so a broken rule on a green day still reads as one.
 */
export function DashboardDayCell({
  dayNumber,
  summary,
  onClick,
  isToday = false,
  fresh = false,
  ruleBroken = false,
  size = 'desktop',
}: DashboardDayCellProps) {
  const { settings } = useSettings();
  const phone = size === 'phone';

  if (dayNumber === null) {
    return <div className={phone ? 'h-[50px]' : 'h-16'} aria-hidden />;
  }

  const hasTrades = Boolean(summary && summary.tradeCount > 0);
  const net = summary?.totalPnl ?? 0;
  const tint = !hasTrades
    ? phone
      ? 'bg-[#0e0e0e] border-white/[0.06]'
      : 'bg-[#0d0d0d] border-white/[0.06]'
    : net >= 0
      ? 'bg-profit-bright/10 border-profit-bright/40'
      : 'bg-loss-bright/10 border-loss-bright/40';
  const today = isToday ? (phone ? 'shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'outline outline-[1.5px] -outline-offset-[1.5px] outline-accent') : '';
  const mark = ruleBroken && (
    <span className="sr-only" key="mark">
      Broke one of your rules
    </span>
  );

  if (phone) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`relative flex h-[50px] flex-col justify-between rounded-[10px] border px-[5px] pt-[5px] pb-1 text-left text-[11px] focus-ring ${tint} ${today} ${
          hasTrades ? 'text-text-secondary' : 'text-text-secondary/70'
        } ${fresh ? 'animate-cell-pop' : ''}`}
      >
        <span className="leading-none">{dayNumber}</span>
        {ruleBroken && <span className="absolute right-[5px] top-[5px] h-1.5 w-1.5 rounded-full bg-amber-400 text-amber-300" title="Broke one of your rules" aria-hidden />}
        {mark}
        {hasTrades && (
          <span className={`text-right text-[11px] font-bold leading-none tracking-tight tabular-nums ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {wholeDollars(net, settings.currency)}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-16 flex-col justify-between rounded-[9px] border px-2 py-1.5 text-left text-[11px] transition-colors hover:brightness-125 focus-ring ${tint} ${today} ${
        hasTrades ? 'text-text-secondary' : 'text-text-secondary/60'
      } ${fresh ? 'animate-cell-pop' : ''}`}
    >
      <span className="leading-none">{dayNumber}</span>
      {hasTrades && (
        <span className="min-w-0">
          <span className={`block truncate text-[13px] font-bold leading-tight tabular-nums ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {formatCurrency(net, settings.currency)}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-text-secondary">
            {summary!.tradeCount} {summary!.tradeCount === 1 ? 'trade' : 'trades'}
            {ruleBroken && (
              <span
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400/20 text-[9px] font-bold text-amber-300"
                title="Broke one of your rules"
                aria-hidden
              >
                !
              </span>
            )}
          </span>
        </span>
      )}
      {mark}
    </button>
  );
}
