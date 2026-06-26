import type { Trade } from '../types';
import type { TradingStats } from './stats';
import { formatCurrency, formatMonthYear } from './format';
import type { CurrencyCode } from '../types/settings';

export function exportTradesCsv(trades: Trade[], filename = 'trades.csv'): void {
  const headers = ['date', 'symbol', 'pnl', 'side', 'setup', 'notes', 'accountId'];
  const rows = trades.map((t) =>
    headers.map((h) => {
      const val = t[h as keyof Trade];
      const str = val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(','),
  );

  const csv = [headers.join(','), ...rows].join('\n');
  downloadBlob(csv, filename, 'text/csv;charset=utf-8');
}

export function exportMonthReport(
  trades: Trade[],
  stats: TradingStats,
  year: number,
  month: number,
  currency: CurrencyCode = 'USD',
): void {
  const monthLabel = formatMonthYear(year, month);
  const fmt = (n: number) => formatCurrency(n, currency);

  const rows = trades
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (t) =>
        `<tr><td>${t.date}</td><td>${t.symbol}</td><td class="${t.pnl >= 0 ? 'win' : 'loss'}">${fmt(t.pnl)}</td><td>${t.setup ?? ''}</td><td>${t.notes ?? ''}</td></tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Trading Journal — ${monthLabel}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .meta { color: #666; margin-bottom: 1.5rem; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
  .stat { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
  .stat label { font-size: 0.75rem; color: #666; text-transform: uppercase; }
  .stat value { font-size: 1.25rem; font-weight: 700; display: block; margin-top: 0.25rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th, td { border-bottom: 1px solid #eee; padding: 0.5rem; text-align: left; }
  th { font-size: 0.75rem; text-transform: uppercase; color: #666; }
  .win { color: #059669; }
  .loss { color: #dc2626; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>Trading Journal Report</h1>
  <p class="meta">${monthLabel}</p>
  <div class="stats">
    <div class="stat"><label>Net P&amp;L</label><value class="${stats.netPnl >= 0 ? 'win' : 'loss'}">${fmt(stats.netPnl)}</value></div>
    <div class="stat"><label>Win Rate</label><value>${stats.totalTrades > 0 ? stats.winRate.toFixed(1) : '—'}%</value></div>
    <div class="stat"><label>Profit Factor</label><value>${stats.totalTrades > 0 ? (stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)) : '—'}</value></div>
    <div class="stat"><label>Avg / Trade</label><value>${stats.totalTrades > 0 ? fmt(stats.avgProfitPerTrade) : '—'}</value></div>
    <div class="stat"><label>Avg / Day</label><value>${stats.tradingDays > 0 ? fmt(stats.avgProfitPerDay) : '—'}</value></div>
    <div class="stat"><label>Trades</label><value>${stats.totalTrades}</value></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Symbol</th><th>P&amp;L</th><th>Setup</th><th>Notes</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No trades this month</td></tr>'}</tbody>
  </table>
  <script>window.onload = () => window.print()</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
