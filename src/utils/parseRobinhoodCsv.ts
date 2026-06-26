import type { ParsedTradeInput } from '../types';

interface RobinhoodRow {
  date: string;
  instrument: string;
  transCode: string;
  quantity: number;
  amount: number;
  description: string;
}

export function parseRobinhoodCsv(text: string): ParsedTradeInput[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('Robinhood CSV appears empty.');
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes('activity date') || h === 'date');
  const instrumentIdx = header.findIndex((h) => h.includes('instrument'));
  const transIdx = header.findIndex((h) => h.includes('trans'));
  const qtyIdx = header.findIndex((h) => h.includes('quantity'));
  const amountIdx = header.findIndex((h) => h.includes('amount'));
  const descIdx = header.findIndex((h) => h.includes('description'));

  if (dateIdx === -1 || transIdx === -1) {
    throw new Error('Could not find Robinhood CSV columns (Activity Date, Trans Code).');
  }

  const rows: RobinhoodRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const transCode = (cols[transIdx] ?? '').toUpperCase();
    if (!['STC', 'BTC', 'BTO', 'STO', 'Sell', 'Buy'].some((c) => transCode.includes(c))) continue;

    const amount = parseMoney(cols[amountIdx] ?? '0');
    rows.push({
      date: parseRobinhoodDate(cols[dateIdx] ?? ''),
      instrument: cols[instrumentIdx] ?? extractSymbol(cols[descIdx] ?? ''),
      transCode,
      quantity: Math.abs(parseFloat(cols[qtyIdx] ?? '0')) || 1,
      amount,
      description: cols[descIdx] ?? '',
    });
  }

  return matchRobinhoodRoundTrips(rows);
}

function matchRobinhoodRoundTrips(rows: RobinhoodRow[]): ParsedTradeInput[] {
  const trades: ParsedTradeInput[] = [];
  const openLots = new Map<string, RobinhoodRow[]>();

  for (const row of rows) {
    const key = row.instrument.toUpperCase();
    const isOpen = row.transCode.includes('BTO') || row.transCode.includes('STO') || row.transCode.includes('Buy');
    const isClose = row.transCode.includes('STC') || row.transCode.includes('BTC') || row.transCode.includes('Sell');

    if (isOpen) {
      const lots = openLots.get(key) ?? [];
      lots.push(row);
      openLots.set(key, lots);
      continue;
    }

    if (isClose) {
      const lots = openLots.get(key);
      const open = lots?.shift();
      const pnl = open ? row.amount + open.amount : row.amount;
      trades.push({
        date: row.date,
        symbol: extractSymbol(row.instrument || row.description),
        pnl,
        side: row.transCode.includes('STO') || row.transCode.includes('Sell') ? 'short' : 'long',
        notes: row.description || undefined,
        contract: row.description || undefined,
      });
    }
  }

  return trades.filter((t) => t.symbol && t.pnl !== 0);
}

function parseRobinhoodDate(raw: string): string {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  const parts = raw.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function extractSymbol(text: string): string {
  const match = text.match(/\b([A-Z]{1,5})\b/);
  return match?.[1] ?? text.slice(0, 6).toUpperCase();
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[$,()]/g, '').trim();
  const negative = raw.includes('(') || raw.includes('-');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
