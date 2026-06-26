import type { ParsedTradeInput } from '../types';
import { parseSchwabCsv } from './parseSchwabCsv';

/** Thinkorswim activity export and TOS-branded Schwab statements. */
export function parseTosCsv(text: string): ParsedTradeInput[] {
  if (text.includes('Account Trade History')) {
    return parseSchwabCsv(text);
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('Thinkorswim CSV appears empty.');
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = header.findIndex((h) => h === 'date' || h.includes('exec time'));
  const typeIdx = header.findIndex((h) => h.includes('type') || h.includes('side'));
  const symbolIdx = header.findIndex((h) => h.includes('symbol'));
  const descIdx = header.findIndex((h) => h.includes('description'));
  const amountIdx = header.findIndex((h) => h.includes('amount') || h.includes('net') || h.includes('p/l'));

  if (dateIdx === -1) {
    throw new Error('Could not parse Thinkorswim CSV. Try exporting Account Trade History from TOS.');
  }

  const trades: ParsedTradeInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const rawDate = cols[dateIdx] ?? '';
    const date = parseTosDate(rawDate);
    const symbol = (cols[symbolIdx] ?? extractSymbol(cols[descIdx] ?? '')).toUpperCase();
    const type = (cols[typeIdx] ?? '').toUpperCase();
    const pnl = parseMoney(cols[amountIdx] ?? '0');

    if (!symbol || pnl === 0) continue;
    if (type && !type.includes('TRD') && !type.includes('SELL') && !type.includes('BUY')) continue;

    trades.push({
      date,
      symbol,
      pnl,
      side: type.includes('SELL') || type.includes('SHORT') ? 'short' : 'long',
      notes: cols[descIdx] || undefined,
    });
  }

  if (trades.length === 0) {
    throw new Error('No trades found in Thinkorswim CSV. Export Account Trade History for best results.');
  }

  return trades;
}

function parseTosDate(raw: string): string {
  const datePart = raw.split(' ')[0];
  const d = new Date(datePart);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function extractSymbol(text: string): string {
  const match = text.match(/\b([A-Z]{1,5})\b/);
  return match?.[1] ?? 'UNKNOWN';
}

function parseMoney(raw: string): number {
  const negative = raw.includes('(') || raw.trim().startsWith('-');
  const n = parseFloat(raw.replace(/[$,()]/g, ''));
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else current += ch;
  }
  result.push(current.trim());
  return result;
}
