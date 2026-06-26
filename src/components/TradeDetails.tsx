import type { Trade } from '../types';
import { formatCurrency } from '../utils/format';
import { marketSessionFromTime, tradeTags } from '../utils/tradeHelpers';

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
  if (trade.grade) rows.push({ label: 'Grade', value: trade.grade });
  if (trade.checklistScore != null) rows.push({ label: 'Checklist', value: `${trade.checklistScore}%` });
  if (isMeaningfulNumber(trade.fees)) rows.push({ label: 'Fees', value: formatCurrency(trade.fees) });
  if (isMeaningfulNumber(trade.grossPnl)) rows.push({ label: 'Gross P/L', value: formatCurrency(trade.grossPnl) });
  if (isNonEmptyString(trade.entryTime)) rows.push({ label: 'Entry', value: trade.entryTime });
  if (isNonEmptyString(trade.exitTime)) rows.push({ label: 'Exit', value: trade.exitTime });
  const session = marketSessionFromTime(trade.entryTime);
  if (session) rows.push({ label: 'Session', value: session });
  if (isMeaningfulNumber(trade.mae)) rows.push({ label: 'MAE', value: formatCurrency(trade.mae) });
  if (isMeaningfulNumber(trade.mfe)) rows.push({ label: 'MFE', value: formatCurrency(trade.mfe) });
  if (isMeaningfulNumber(trade.rMultiple)) rows.push({ label: 'R multiple', value: String(trade.rMultiple) });
  if (isMeaningfulNumber(trade.ivRank)) rows.push({ label: 'IV rank', value: `${trade.ivRank}%` });
  if (trade.assetClass) rows.push({ label: 'Asset', value: trade.assetClass });
  const tags = tradeTags(trade as Trade);
  if (tags.length > 1 || (tags.length === 1 && tags[0] !== trade.setup)) {
    rows.push({ label: 'Tags', value: tags.join(', ') });
  }

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
      {trade.imageUrls && trade.imageUrls.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {trade.imageUrls.map((url, i) => (
            <img key={i} src={url} alt="Trade chart" className="w-20 h-20 object-cover rounded border border-border/60" />
          ))}
        </div>
      )}
    </div>
  );
}
