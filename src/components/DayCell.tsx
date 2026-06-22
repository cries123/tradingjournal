import type { DailySummary } from '../types';
import { formatCurrency } from '../utils/format';

interface DayCellProps {
  dayNumber: number | null;
  summary: DailySummary | null;
  onClick?: () => void;
}

const MAX_TAGS = 2;

export function DayCell({ dayNumber, summary, onClick }: DayCellProps) {
  if (dayNumber === null) {
    return <div className="min-h-[100px] bg-bg-primary rounded-sm" />;
  }

  const hasTrades = summary && summary.tradeCount > 0;
  const bgClass = !hasTrades
    ? 'bg-neutral'
    : summary.totalPnl >= 0
      ? 'bg-profit hover:bg-profit-hover'
      : 'bg-loss hover:bg-loss-hover';

  const visibleTags = summary?.tags.slice(0, MAX_TAGS) ?? [];
  const extraTags = (summary?.tags.length ?? 0) - MAX_TAGS;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[100px] p-2 rounded-sm text-left transition-colors cursor-pointer flex flex-col ${bgClass} ${!hasTrades ? 'cursor-default' : ''}`}
    >
      <div className="flex justify-between items-start mb-1">
        {hasTrades ? (
          <span className="text-sm font-semibold text-white leading-tight">
            {formatCurrency(summary.totalPnl)}
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs text-white/70">{dayNumber}</span>
      </div>

      {hasTrades && (
        <>
          <span className="text-xs text-white/80 mb-1.5">
            {summary.tradeCount} {summary.tradeCount === 1 ? 'Trade' : 'Trades'}
          </span>
          <div className="flex flex-wrap gap-1 mt-auto">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-tag text-bg-primary rounded-sm"
              >
                {tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="text-[10px] text-white/70 self-center">
                +{extraTags} more
              </span>
            )}
          </div>
        </>
      )}
    </button>
  );
}
