import { formatCurrency } from '../utils/format';

interface WeekSummaryCellProps {
  totalPnl: number;
  tradeCount: number;
}

export function WeekSummaryCell({ totalPnl, tradeCount }: WeekSummaryCellProps) {
  const hasTrades = tradeCount > 0;

  return (
    <div className="min-h-[100px] p-2 rounded-sm bg-bg-secondary border border-border flex flex-col justify-center items-center text-center">
      {hasTrades ? (
        <>
          <span
            className={`text-sm font-semibold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {formatCurrency(totalPnl)}
          </span>
          <span className="text-xs text-text-secondary mt-1">
            {tradeCount} {tradeCount === 1 ? 'Trade' : 'Trades'}
          </span>
        </>
      ) : (
        <span className="text-xs text-text-secondary">—</span>
      )}
    </div>
  );
}
