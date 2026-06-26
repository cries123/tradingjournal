import type { Trade } from '../types';
import { formatCurrency } from '../utils/format';

interface TradeDetailsProps {
  trade: Partial<Trade>;
  compact?: boolean;
}

function isMeaningfulNumber(value: number | null | undefined): value is number {
  return value != null && value !== 0 && !Number.isNaN(value);
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

export function TradeDetails({ trade, compact }: TradeDetailsProps) {
  const rows: { label: string; value: string }[] = [];

  if (trade.isGhost) rows.push({ label: 'Type', value: 'Ghost / missed trade' });
  if (isNonEmptyString(trade.psychology)) rows.push({ label: 'Psychology', value: trade.psychology });
  if (
    trade.ruleAdherence != null &&
    (trade.ruleAdherence !== 5 || isNonEmptyString(trade.psychology))
  ) {
    rows.push({ label: 'Rule adherence', value: `${trade.ruleAdherence}/10` });
  }
  if (trade.marketContext?.length) {
    rows.push({ label: 'Market context', value: trade.marketContext.join(', ') });
  }
  if (isNonEmptyString(trade.contract)) rows.push({ label: 'Contract', value: trade.contract });
  if (isNonEmptyString(trade.optionType)) rows.push({ label: 'Option type', value: trade.optionType.toUpperCase() });
  if (isNonEmptyString(trade.expiration)) rows.push({ label: 'Expiration', value: trade.expiration });
  if (isMeaningfulNumber(trade.strike)) rows.push({ label: 'Strike', value: `$${trade.strike}` });
  if (isMeaningfulNumber(trade.quantity)) rows.push({ label: 'Qty', value: String(trade.quantity) });
  if (isMeaningfulNumber(trade.underlyingPrice)) {
    rows.push({ label: 'Underlying', value: `$${trade.underlyingPrice}` });
  }
  if (isMeaningfulNumber(trade.mark)) rows.push({ label: 'Mark', value: `$${trade.mark}` });
  if (isMeaningfulNumber(trade.tradePrice)) rows.push({ label: 'Trade Price', value: `$${trade.tradePrice}` });
  if (isMeaningfulNumber(trade.pnlOpen)) {
    rows.push({ label: 'P/L Open', value: formatCurrency(trade.pnlOpen) });
  }
  if (isMeaningfulNumber(trade.netLiq)) {
    rows.push({ label: 'Net Liq', value: formatCurrency(trade.netLiq) });
  }
  if (isNonEmptyString(trade.accountType)) rows.push({ label: 'Account', value: trade.accountType });

  const greeks = [
    isMeaningfulNumber(trade.delta) ? `Δ ${trade.delta}` : null,
    isMeaningfulNumber(trade.gamma) ? `Γ ${trade.gamma}` : null,
    isMeaningfulNumber(trade.theta) ? `Θ ${trade.theta}` : null,
    isMeaningfulNumber(trade.vega) ? `V ${trade.vega}` : null,
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
