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

/**
 * Which queue a fill belongs to — including which way round it is.
 *
 * The side used to be left out, so long and short lots of the same contract shared one FIFO
 * queue and a close took whatever was at the front regardless of direction. Selling a call
 * against one you already held produced two trades with both signs inverted and a day total
 * hundreds of dollars from the statement.
 *
 * server/mapSnapTradeActivities.ts hit exactly this and fixed it — "the day was $328 off a
 * statement that every other day agreed with to the dollar" — and the CSV importer was left
 * behind. See lotSideFor there for the full reasoning; this is the same rule.
 */
function contractKey(e: RawExecution, long: boolean): string {
  return `${e.symbol}|${e.exp}|${e.strike}|${e.type}|${long ? 'long' : 'short'}`;
}

/** A BUY TO OPEN opens a long; a SELL TO OPEN opens a short. */
function opensLong(e: RawExecution): boolean {
  return e.side === 'BUY';
}

/**
 * Which direction a close is unwinding.
 *
 * A SELL TO CLOSE closes a long, a BUY TO CLOSE closes a short — the opposite of what the same
 * side means on an open. Reading it off the close is what lets a close find its own lot instead
 * of the first one in the queue.
 */
function closesLong(e: RawExecution): boolean {
  return e.side === 'SELL';
}

/**
 * Schwab's per-CONTRACT options commission.
 *
 * Per contract, never per share: Schwab charges nothing to trade equities. Applied to a share
 * count it invented $650 of commission on a 500-share round trip and turned a $500 winner into a
 * $150 loser — which then lands in the loser bucket of every win rate, profit factor, tax export
 * and published record downstream.
 */
function feesFor(e: RawExecution): number {
  return isOption(e.type) ? e.qty * FEE_PER_CONTRACT : 0;
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

/**
 * The clock time out of an execution timestamp, as HH:MM.
 *
 * Schwab and thinkorswim both export "Exec Time" as a full timestamp, and this importer was
 * splitting it on the space, keeping the date and dropping the time into a sentence in the notes
 * field. So every CSV-imported trade arrived without an entry time, and the hour-of-day panel had
 * nothing to read for anyone who imports rather than syncs — which is most people.
 *
 * Returns undefined rather than a guess when there is no time in the string: an invented 00:00
 * would put a whole journal in the midnight bucket and read as a real finding.
 */
export function execClockTime(execTime: string): string | undefined {
  const match = /(\d{1,2}):(\d{2})/.exec(execTime);
  if (!match) return undefined;

  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour > 23) return undefined;

  // 12-hour exports carry a meridiem; normalise so 1:05 PM sorts after 11:05 AM.
  const pm = /p\.?m\.?/i.test(execTime);
  const am = /a\.?m\.?/i.test(execTime);
  let h = hour;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;

  return `${String(h).padStart(2, '0')}:${match[2]}`;
}

function matchRoundTrips(executions: RawExecution[]): ParsedTradeInput[] {
  const openLots = new Map<string, OpenLot[]>();
  const trades: ParsedTradeInput[] = [];

  for (const exec of executions) {
    const opening = exec.posEffect === 'TO OPEN';
    // An open files by the direction it opens; a close looks in the queue it unwinds.
    const key = contractKey(exec, opening ? opensLong(exec) : closesLong(exec));
    if (!openLots.has(key)) openLots.set(key, []);

    if (opening) {
      openLots.get(key)!.push({
        qty: exec.qty,
        price: exec.price,
        fees: feesFor(exec),
        exec,
      });
      continue;
    }

    // TO CLOSE
    let remaining = exec.qty;
    const closeFees = feesFor(exec);
    const queue = openLots.get(key)!;

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const matched = Math.min(remaining, lot.qty);
      const mult = multiplier(exec.type);

      /*
       * Direction taken from the LOT, not from the closing fill.
       *
       * They agree whenever the queue is pure, which it now is — but reading it off the close
       * was half of the inversion bug, and reading it off the lot is what actually describes the
       * position being unwound.
       */
      const grossPnl = opensLong(lot.exec)
        ? (exec.price - lot.price) * matched * mult
        : (lot.price - exec.price) * matched * mult;

      const feeShare =
        (lot.fees * (matched / lot.qty)) + (closeFees * (matched / exec.qty));
      const pnl = grossPnl - feeShare;

      trades.push(buildTrade(lot.exec, exec, matched, pnl, grossPnl, feeShare));

      lot.qty -= matched;
      remaining -= matched;
      if (lot.qty <= 0.0001) queue.shift();
    }
  }

  return trades;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

function buildTrade(
  open: RawExecution,
  close: RawExecution,
  qty: number,
  pnl: number,
  grossPnl: number,
  fees: number,
): ParsedTradeInput {
  const optionType = open.type === 'PUT' ? 'put' : open.type === 'CALL' ? 'call' : undefined;
  const contract = isOption(open.type)
    ? `${open.symbol} ${open.exp} ${open.strike} ${open.type.charAt(0)}`
    : open.symbol;

  return {
    symbol: open.symbol,
    pnl: cents(pnl),
    /*
     * The commission is RECORDED, not just subtracted.
     *
     * This importer worked out a fee per contract, took it off the P&L, and then wrote neither the
     * gross nor the fee onto the trade — so an estimate the app had already applied to somebody's
     * numbers was invisible and uncorrectable. The costs panel then reported commissions over a
     * denominator that included these fee-less trades, and the tax export printed $0.00 of fees
     * beside a P&L that had fees in it.
     *
     * effectivePnl returns the same net as before, because it recomputes gross − fees and that is
     * exactly how pnl was derived above. mapSnapTradeActivities writes both fields for the same
     * reason.
     */
    grossPnl: cents(grossPnl),
    fees: cents(fees),
    date: close.date,
    // The opening fill's date, which only this loop knows. Anything measuring from the open — days
    // to expiry, holding period — had nothing to read and silently used the close instead.
    openDate: open.date,
    side: open.side === 'BUY' ? 'long' : 'short',
    contract,
    assetType: isOption(open.type) ? 'option' : 'stock',
    optionType,
    expiration: parseExpDate(open.exp),
    strike: open.strike ? parseNumber(open.strike) : undefined,
    quantity: qty,
    tradePrice: open.price,
    exitPrice: close.price,
    entryTime: execClockTime(open.execTime),
    exitTime: execClockTime(close.execTime),
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
