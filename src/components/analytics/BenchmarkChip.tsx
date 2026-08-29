import type { BenchmarkQuote } from '../../services/benchmark';

interface BenchmarkChipProps {
  /** The trader's return for the period, already expressed as a percentage of their capital. */
  returnPct: number;
  quote: BenchmarkQuote | null;
}

/**
 * "You vs the market" for the current month.
 *
 * Beating a positive market and merely losing less than a falling one are different results, so
 * the chip states both numbers and only claims a win on the gap between them. Renders nothing
 * when the quote is missing — a market-data outage should not leave a broken slot in the header.
 */
export function BenchmarkChip({ returnPct, quote }: BenchmarkChipProps) {
  if (!quote) return null;

  const market = quote.monthToDateReturnPct;
  const gap = returnPct - market;
  const ahead = gap >= 0;
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  return (
    <span
      className="stat-chip"
      title={`Your return vs ${quote.symbol} month-to-date, as of ${quote.asOf}`}
    >
      <span className={`chip-value ${returnPct >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
        {fmt(returnPct)}
      </span>
      <span className="text-text-secondary">vs {quote.symbol}</span>
      <span className={`chip-value ${market >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
        {fmt(market)}
      </span>
      <span
        className={`text-[10px] font-semibold ${ahead ? 'text-profit-bright' : 'text-loss-bright'}`}
      >
        {ahead ? '▲' : '▼'} {Math.abs(gap).toFixed(1)}
      </span>
    </span>
  );
}
