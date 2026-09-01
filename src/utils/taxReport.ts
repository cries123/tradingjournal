import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';
import { detectWashSales, type WashSaleMatch } from './washSale';

/**
 * The year-end file someone hands their accountant.
 *
 * The export this replaces produced a file called `tax-realized-2026.csv` containing every trade in
 * the journal regardless of year — so a first-year filer handed their accountant a document whose
 * name said one thing and whose contents said another. That is the bug worth fixing here; the
 * totals and the per-symbol rollup are what makes the file worth opening.
 *
 * Wash sales are marked as POTENTIAL throughout, deliberately. Matching a disallowed loss properly
 * needs purchase lots and the substantially-identical test, and this journal stores round-trip
 * results — enough to say "look at this one", never enough to say "this is disallowed". Presenting
 * an estimate as a determination on somebody's tax return is not a trade worth making.
 */

/** A wash sale reaches 30 days either side of the loss, so a year's detection needs a margin. */
const WASH_SALE_MARGIN_DAYS = 31;

export interface TaxSymbolRow {
  symbol: string;
  trades: number;
  gains: number;
  losses: number;
  net: number;
}

export interface TaxTradeRow {
  date: string;
  symbol: string;
  realizedPnl: number;
  fees: number;
  netPnl: number;
  assetClass: string;
  potentialWashSale: boolean;
  flaggedLoss: number;
  replacementDate: string;
}

export interface TaxYearReport {
  year: number;
  tradeCount: number;
  /** Sum of the winning trades, net of their own fees. */
  grossGains: number;
  /** Sum of the losing trades, net of their own fees. Negative. */
  grossLosses: number;
  /** grossGains + grossLosses. Fees are already inside both. */
  netPnl: number;
  /** Total commissions and fees recorded, reported separately for reference only. */
  fees: number;
  potentialWashSaleCount: number;
  /** Losses sitting behind those flags. NOT a disallowed-loss figure — see the note above. */
  flaggedLossTotal: number;
  symbols: TaxSymbolRow[];
  rows: TaxTradeRow[];
}

function yearOf(date: string): number | null {
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every year the journal has a trade in, newest first — what the year picker offers. */
export function availableTaxYears(trades: Trade[]): number[] {
  const years = new Set<number>();
  for (const t of trades) {
    const year = yearOf(t.date);
    if (year !== null) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Build the report for one tax year.
 *
 * Wash-sale detection runs over the year PLUS a month either side, then reports only the losses
 * dated inside the year. A December loss repurchased in January is the textbook case, and scoping
 * detection to the year alone would miss exactly the one people get wrong.
 */
export function buildTaxReport(trades: Trade[], year: number): TaxYearReport {
  const inYear = trades.filter((t) => yearOf(t.date) === year);

  const from = shiftDays(`${year}-01-01`, -WASH_SALE_MARGIN_DAYS);
  const to = shiftDays(`${year}-12-31`, WASH_SALE_MARGIN_DAYS);
  const withMargin = trades.filter((t) => t.date >= from && t.date <= to);

  const flags = new Map<string, WashSaleMatch>();
  for (const match of detectWashSales(withMargin)) {
    if (yearOf(match.lossDate) === year) flags.set(match.lossTradeId, match);
  }

  const rows: TaxTradeRow[] = [...inYear]
    .sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol))
    .map((t) => {
      const flag = flags.get(t.id);
      return {
        date: t.date,
        symbol: t.symbol,
        realizedPnl: t.grossPnl ?? t.pnl,
        fees: t.fees ?? 0,
        netPnl: effectivePnl(t),
        assetClass: t.assetClass ?? t.assetType ?? 'stock',
        potentialWashSale: Boolean(flag),
        flaggedLoss: flag ? Math.abs(flag.disallowedLoss) : 0,
        replacementDate: flag?.replacementDate ?? '',
      };
    });

  const bySymbol = new Map<string, TaxSymbolRow>();
  for (const row of rows) {
    const entry = bySymbol.get(row.symbol) ?? {
      symbol: row.symbol,
      trades: 0,
      gains: 0,
      losses: 0,
      net: 0,
    };
    entry.trades += 1;
    if (row.netPnl >= 0) entry.gains += row.netPnl;
    else entry.losses += row.netPnl;
    entry.net += row.netPnl;
    bySymbol.set(row.symbol, entry);
  }

  const grossGains = rows.filter((r) => r.netPnl >= 0).reduce((sum, r) => sum + r.netPnl, 0);
  const grossLosses = rows.filter((r) => r.netPnl < 0).reduce((sum, r) => sum + r.netPnl, 0);

  return {
    year,
    tradeCount: rows.length,
    grossGains,
    grossLosses,
    netPnl: grossGains + grossLosses,
    fees: rows.reduce((sum, r) => sum + r.fees, 0),
    potentialWashSaleCount: rows.filter((r) => r.potentialWashSale).length,
    flaggedLossTotal: rows.reduce((sum, r) => sum + r.flaggedLoss, 0),
    symbols: [...bySymbol.values()].sort((a, b) => b.net - a.net),
    rows,
  };
}

function cell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * The report as one CSV.
 *
 * Summary block first, then the per-symbol rollup, then the detail rows — the shape brokerages use
 * for their own year-end files, and the shape someone wants when they double-click it. Sectioned
 * with blank lines and header rows rather than split across three downloads, because the person
 * receiving this is going to email it to one accountant once a year.
 */
export function taxReportCsv(report: TaxYearReport): string {
  const lines: string[] = [];

  lines.push(`Trend Chasers realized P&L summary,${report.year}`);
  lines.push(`Generated,${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('Summary,Amount');
  lines.push(`Trades closed,${report.tradeCount}`);
  lines.push(`Gross gains,${money(report.grossGains)}`);
  lines.push(`Gross losses,${money(report.grossLosses)}`);
  lines.push(`Net realized P&L,${money(report.netPnl)}`);
  lines.push(`Commissions and fees (already deducted above),${money(report.fees)}`);
  lines.push(`Potential wash sales flagged,${report.potentialWashSaleCount}`);
  lines.push(`Loss behind those flags,${money(report.flaggedLossTotal)}`);
  lines.push('');
  lines.push(
    cell(
      'Note: wash sales are flagged for review only, from round-trip results. They are not a ' +
        'disallowed-loss calculation. Confirm every flag against broker statements before filing.',
    ),
  );
  lines.push('');

  lines.push('By symbol,Trades,Gains,Losses,Net');
  for (const s of report.symbols) {
    lines.push([cell(s.symbol), s.trades, money(s.gains), money(s.losses), money(s.net)].join(','));
  }
  lines.push('');

  lines.push('Date,Symbol,Realized P&L,Fees,Net P&L,Asset class,Potential wash sale,Loss flagged,Replacement date');
  for (const r of report.rows) {
    lines.push(
      [
        r.date,
        cell(r.symbol),
        money(r.realizedPnl),
        money(r.fees),
        money(r.netPnl),
        cell(r.assetClass),
        r.potentialWashSale ? 'REVIEW' : '',
        r.flaggedLoss ? money(r.flaggedLoss) : '',
        r.replacementDate,
      ].join(','),
    );
  }

  return lines.join('\n');
}
