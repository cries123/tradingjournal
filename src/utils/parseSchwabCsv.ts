import type { ParsedTradeInput } from '../types';

interface RawExecution {
  execTime: string;
  date: string;
  side: string;
  qty: number;
  posEffect: string;
  symbol: string;
  exp: string;
  strike: string;
  type: string;
  price: number;
}

const FEE_PER_CONTRACT = 0.65;

export interface SchwabImportPreview extends ParsedTradeInput {
  id: string;
  selected: boolean;
}

export function parseSchwabCsv(text: string): ParsedTradeInput[] {
  const section = extractTradeHistorySection(text);
  if (!section) {
    throw new Error('Could not find "Account Trade History" in this CSV. Export from Schwab/Thinkorswim.');
  }

  const rows = parseCsvSection(section);
  const executions: RawExecution[] = [];

  for (const row of rows) {
    if (row.length < 11) continue;
    const execTime = row[1]?.trim();
    const posEffect = row[5]?.trim().toUpperCase();
    if (!execTime || (posEffect !== 'TO OPEN' && posEffect !== 'TO CLOSE')) continue;

    const date = execTime.split(' ')[0];
    executions.push({
      execTime,
      date: parseSchwabDate(date),
      side: row[3]?.trim().toUpperCase() ?? '',
      qty: Math.abs(parseNumber(row[4])),
      posEffect,
      symbol: row[6]?.trim().toUpperCase() ?? '',
      exp: row[7]?.trim() ?? '',
      strike: row[8]?.trim() ?? '',
      type: row[9]?.trim().toUpperCase() ?? '',
      price: parseNumber(row[10]),
    });
  }

  executions.sort((a, b) => a.execTime.localeCompare(b.execTime));
  return matchRoundTrips(executions);
}

function extractTradeHistorySection(text: string): string | null {
  const marker = 'Account Trade History';
  const start = text.indexOf(marker);
  if (start === -1) return null;

  const after = text.slice(start);
  const endMarkers = ['\nEquities', '\nProfits and Losses', '\nAccount Summary'];
  let end = after.length;
  for (const m of endMarkers) {
    const idx = after.indexOf(m);
    if (idx !== -1) end = Math.min(end, idx);
  }
  return after.slice(0, end);
}

function parseCsvSection(section: string): string[][] {
  const lines = section.split('\n');
  const rows: string[][] = [];
  // skip header lines (first 2 lines after marker)
  let started = false;
  for (const line of lines) {
    if (!started) {
      if (line.includes('Exec Time') && line.includes('Symbol')) started = true;
      continue;
    }
    if (!line.trim() || line.startsWith('Equities')) break;
    rows.push(parseCsvLine(line));
  }
  return rows;
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
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$",]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : '')).trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseSchwabDate(value: string): string {
  const [m, d, y] = value.split('/');
  const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function contractKey(e: RawExecution): string {
  return `${e.symbol}|${e.exp}|${e.strike}|${e.type}`;
}

function isOption(type: string): boolean {
  return type === 'CALL' || type === 'PUT';
}

function multiplier(type: string): number {
  return isOption(type) ? 100 : 1;
}

interface OpenLot {
  qty: number;
  price: number;
  fees: number;
  exec: RawExecution;
}

function matchRoundTrips(executions: RawExecution[]): ParsedTradeInput[] {
  const openLots = new Map<string, OpenLot[]>();
  const trades: ParsedTradeInput[] = [];

  for (const exec of executions) {
    const key = contractKey(exec);
    if (!openLots.has(key)) openLots.set(key, []);

    if (exec.posEffect === 'TO OPEN') {
      openLots.get(key)!.push({
        qty: exec.qty,
        price: exec.price,
        fees: exec.qty * FEE_PER_CONTRACT,
        exec,
      });
      continue;
    }

    // TO CLOSE
    let remaining = exec.qty;
    const closeFees = exec.qty * FEE_PER_CONTRACT;
    const queue = openLots.get(key)!;

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const matched = Math.min(remaining, lot.qty);
      const mult = multiplier(exec.type);

      const grossPnl =
        exec.side === 'SELL'
          ? (exec.price - lot.price) * matched * mult
          : (lot.price - exec.price) * matched * mult;

      const feeShare =
        (lot.fees * (matched / lot.qty)) + (closeFees * (matched / exec.qty));
      const pnl = grossPnl - feeShare;

      trades.push(buildTrade(lot.exec, exec, matched, pnl));

      lot.qty -= matched;
      remaining -= matched;
      if (lot.qty <= 0.0001) queue.shift();
    }
  }

  return trades;
}

function buildTrade(
  open: RawExecution,
  close: RawExecution,
  qty: number,
  pnl: number,
): ParsedTradeInput {
  const optionType = open.type === 'PUT' ? 'put' : open.type === 'CALL' ? 'call' : undefined;
  const contract = isOption(open.type)
    ? `${open.symbol} ${open.exp} ${open.strike} ${open.type.charAt(0)}`
    : open.symbol;

  return {
    symbol: open.symbol,
    pnl: Math.round(pnl * 100) / 100,
    date: close.date,
    side: open.side === 'BUY' ? 'long' : 'short',
    contract,
    assetType: isOption(open.type) ? 'option' : 'stock',
    optionType,
    expiration: parseExpDate(open.exp),
    strike: open.strike ? parseNumber(open.strike) : undefined,
    quantity: qty,
    tradePrice: open.price,
    notes: `Closed ${close.execTime} @ ${close.price} (opened @ ${open.price})`,
    accountType: 'Individual',
  };
}

function parseExpDate(exp: string): string | undefined {
  if (!exp.trim()) return undefined;
  const match = exp.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})/i);
  if (!match) return undefined;
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const year = match[3].length === 2 ? 2000 + parseInt(match[3], 10) : parseInt(match[3], 10);
  return `${year}-${months[match[2].toUpperCase()]}-${match[1].padStart(2, '0')}`;
}

export function previewSchwabCsv(text: string): SchwabImportPreview[] {
  return parseSchwabCsv(text).map((t) => ({
    ...t,
    id: crypto.randomUUID(),
    selected: true,
  }));
}
