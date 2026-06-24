import type { Trade } from '../types';
import { formatCurrency } from '../utils/format';

interface TradeDetailsProps {
  trade: Partial<Trade>;
  compact?: boolean;
}

export function TradeDetails({ trade, compact }: TradeDetailsProps) {
  const rows: { label: string; value: string }[] = [];

  if (trade.contract) rows.push({ label: 'Contract', value: trade.contract });
  if (trade.optionType) rows.push({ label: 'Type', value: trade.optionType.toUpperCase() });
  if (trade.expiration) rows.push({ label: 'Expiration', value: trade.expiration });
  if (trade.strike != null) rows.push({ label: 'Strike', value: `$${trade.strike}` });
  if (trade.quantity != null) rows.push({ label: 'Qty', value: String(trade.quantity) });
  if (trade.underlyingPrice != null) {
    rows.push({ label: 'Underlying', value: `$${trade.underlyingPrice}` });
  }
  if (trade.mark != null) rows.push({ label: 'Mark', value: `$${trade.mark}` });
  if (trade.tradePrice != null) rows.push({ label: 'Trade Price', value: `$${trade.tradePrice}` });
  if (trade.pnlOpen != null) {
    rows.push({ label: 'P/L Open', value: formatCurrency(trade.pnlOpen) });
  }
  if (trade.netLiq != null) rows.push({ label: 'Net Liq', value: formatCurrency(trade.netLiq) });
  if (trade.accountType) rows.push({ label: 'Account', value: trade.accountType });

  const greeks = [
    trade.delta != null ? `Δ ${trade.delta}` : null,
    trade.gamma != null ? `Γ ${trade.gamma}` : null,
    trade.theta != null ? `Θ ${trade.theta}` : null,
    trade.vega != null ? `V ${trade.vega}` : null,
  ].filter(Boolean);

  if (greeks.length > 0) {
    rows.push({ label: 'Greeks', value: greeks.join(' · ') });
  }

  if (rows.length === 0 && !trade.notes) return null;

  return (
    <div className={`${compact ? 'mt-2' : 'mt-3'} space-y-1`}>
      {rows.map(({ label, value }) => (
        <div key={label} className="flex gap-2 text-xs">
          <span className="text-text-secondary shrink-0 w-20">{label}</span>
          <span className="text-text-primary">{value}</span>
        </div>
      ))}
      {trade.notes && (
        <p className="text-xs text-text-secondary mt-1">{trade.notes}</p>
      )}
    </div>
  );
}
