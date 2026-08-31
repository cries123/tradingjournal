import type { Trade } from '../types';
import { formatCurrency } from '../utils/format';
import { TradeDetails } from './TradeDetails';
import { tradeBasicLabel, tradeBasicSubtitle } from '../utils/tradeLabels';

interface TradeListItemProps {
  trade: Partial<Trade>;
  expanded: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
}

export function TradeListItem({
  trade,
  expanded,
  onToggle,
  trailing,
  leading,
}: TradeListItemProps) {
  const subtitle = tradeBasicSubtitle(trade);
  const pnl = trade.pnl;

  return (
    <div className="bg-bg-tertiary rounded-md overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        {leading}
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left min-w-0 hover:opacity-80 transition-opacity"
        >
          <span className="text-text-secondary text-xs shrink-0 w-4">
            {expanded ? '▼' : '▶'}
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm">{tradeBasicLabel(trade)}</span>
            {subtitle && !expanded && (
              <p className="text-xs text-text-secondary truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          {pnl != null && (
            <span className={`text-sm font-semibold shrink-0 ${pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {formatCurrency(pnl)}
            </span>
          )}
        </button>
        {trailing}
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          <TradeDetails trade={trade} />
        </div>
      )}
    </div>
  );
}
