import type { Trade } from '../types';
import { formatCurrency } from '../utils/format';
import { TradeDetails } from './TradeDetails';

export function tradeBasicLabel(trade: Partial<Trade>): string {
  const parts = [trade.symbol ?? ''];
  if (trade.optionType) parts.push(trade.optionType.toUpperCase());
  if (trade.side) parts.push(trade.side.charAt(0).toUpperCase() + trade.side.slice(1));
  return parts.filter(Boolean).join(' ');
}

export function tradeBasicSubtitle(trade: Partial<Trade>): string | undefined {
  if (trade.contract) return trade.contract;
  if (trade.strike != null && trade.expiration) {
    return `$${trade.strike} · ${trade.expiration}`;
  }
  return trade.notes;
}

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
            {trade.isGhost && (
              <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-500/15 text-violet-300 border border-violet-500/30">
                Ghost
              </span>
            )}
            {subtitle && !expanded && (
              <p className="text-xs text-text-secondary truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          {pnl != null && (
            <span className={`text-sm font-semibold shrink-0 ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
