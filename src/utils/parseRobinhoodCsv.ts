import type { ParsedTradeInput } from '../types';

/**
 * Robinhood's account activity CSV.
 *
 * Unlike the Schwab path this file works from the AMOUNT column — the signed cash that moved — not
 * from prices. That is the right choice for this broker: the amount already nets Robinhood's
 * regulatory fees and already accounts for an option's 100 multiplier, so nothing here has to guess
 * at either. Everything below exists because the first version read that column into a shape that
 * could not be right.
 */

type Direction = 'long' | 'short';

/**
 * Robinhood's transaction codes, and what each one does to a position.
 *
 * Matched exactly, against the whole code. The first version tested `transCode.includes(c)` over a
 * list holding 'Sell' and 'Buy' — mixed case, against a string it had already uppercased, so those
 * two could never match anything. Robinhood writes a plain stock trade as Buy or Sell, which meant
 * EVERY equity trade was dropped at the filter and the importer reported "no trades found" on a file
 * full of them. The same dead comparison then set the side, so every short option came out long.
 *
 * SELL is read as closing a long because that is overwhelmingly what it is. A margin short sale is
 * indistinguishable from it in this file, so a short stock position imports as nothing rather than
 * as a guess — see the unmatched-close note in matchRoundTrips.
 */
const TRADE_CODES: Record<string, { opens: boolean; direction: Direction }> = {
  BTO: { opens: true, direction: 'long' },
  STO: { opens: true, direction: 'short' },
  STC: { opens: false, direction: 'long' },
  BTC: { opens: false, direction: 'short' },
  BUY: { opens: true, direction: 'long' },
  SELL: { opens: false, direction: 'long' },
};

interface RobinhoodFill {
  date: string;
  symbol: string;
  /** The description when it names an option contract — otherwise null for a plain stock. */
  contract: string | null;
  quantity: number;
  /** Cash as the broker reported it: negative when money left the account. */
  amount: number;
  opens: boolean;
  direction: Direction;
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
  if (amountIdx === -1) {
    /*
     * Said out loud rather than discovered later.
     *
     * Every P&L in this file comes from the amount column. Without it, cols[-1] read as undefined,
     * every trade was worth exactly $0, and the zero filter at the end then removed all of them —
     * so a file with the wrong columns reported no trades at all and gave no reason.
     */
    throw new Error('Could not find the Amount column in this Robinhood CSV.');
  }

  const fills: RobinhoodFill[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const code = TRADE_CODES[(cols[transIdx] ?? '').trim().toUpperCase()];
    if (!code) continue;

    const date = parseRobinhoodDate(cols[dateIdx] ?? '');
    // A row whose date cannot be read is skipped, not stamped with today. Today's date was what the
    // old fallback invented, which silently moved somebody's trade onto a day they did not trade.
    if (!date) continue;

    const description = (descIdx === -1 ? '' : cols[descIdx] ?? '').trim();
    const instrument = (instrumentIdx === -1 ? '' : cols[instrumentIdx] ?? '').trim();
    const symbol = (instrument || extractSymbol(description)).toUpperCase();
    if (!symbol) continue;

    fills.push({
      date,
      symbol,
      contract: namesAnOption(description) ? description : null,
      // Missing or zero quantity is treated as one unit: it is the only reading that keeps the
      // amounts intact, and the amount is where the money is.
      quantity: Math.abs(parseFloat(cols[qtyIdx] ?? '0')) || 1,
      amount: parseMoney(cols[amountIdx] ?? '0'),
      opens: code.opens,
      direction: code.direction,
      description,
    });
  }

  return matchRoundTrips(fills);
}

/** One FIFO queue per contract AND direction, never one per ticker. */
function lotKey(fill: RobinhoodFill): string {
  return `${fill.contract ?? fill.symbol}|${fill.direction}`;
}

interface OpenLot {
  quantity: number;
  /** Signed cash per unit, so a partial close takes its share and no more. */
  amountPerUnit: number;
  fill: RobinhoodFill;
}

/**
 * Pairs opens with closes, by contract, direction and quantity.
 *
 * Three things were wrong here and each one produced wrong money.
 *
 * The queue was keyed on the ticker alone, so every option on one underlying shared it and a close
 * was paired with whatever happened to be first — a $660 call closed against a $640 put. Long and
 * short shared it too, which is the same bug the Schwab importer and mapSnapTradeActivities have
 * both now been fixed for.
 *
 * Quantity was parsed and then never used: a close took one whole lot regardless of size, so
 * selling one of five contracts booked the entire five-lot position as closed, five times the real
 * P&L, and left nothing to match the rest of the scale-out against.
 *
 * Worst, a close with no open to pair with was imported anyway, at `pnl = row.amount` — the gross
 * proceeds of the sale. A Robinhood export almost always starts mid-position, so selling $50,000 of
 * stock that was bought before the window appeared in the journal as a $50,000 profit. Those rows
 * are now dropped, which is what the Schwab importer does and the only safe reading: a trade whose
 * entry is not in the file cannot have its P&L computed from the file.
 */
function matchRoundTrips(fills: RobinhoodFill[]): ParsedTradeInput[] {
  const openLots = new Map<string, OpenLot[]>();
  const trades: ParsedTradeInput[] = [];

  for (const fill of fills) {
    const key = lotKey(fill);

    if (fill.opens) {
      const lots = openLots.get(key) ?? [];
      lots.push({
        quantity: fill.quantity,
        amountPerUnit: fill.amount / fill.quantity,
        fill,
      });
      openLots.set(key, lots);
      continue;
    }

    const queue = openLots.get(key);
    if (!queue || queue.length === 0) continue;

    const closeAmountPerUnit = fill.amount / fill.quantity;
    let remaining = fill.quantity;

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const matched = Math.min(remaining, lot.quantity);

      // Both sides are already signed, so the round trip is simply what came in plus what went out.
      const pnl = (closeAmountPerUnit + lot.amountPerUnit) * matched;
      trades.push(buildTrade(lot.fill, fill, matched, pnl));

      lot.quantity -= matched;
      remaining -= matched;
      if (lot.quantity <= 0.000001) queue.shift();
    }
  }

  // A scratch is a trade: it counts in the trade count and against the win rate, and the old
  // `pnl !== 0` filter quietly threw those away. Only a row with no symbol is unusable.
  return trades.filter((t) => t.symbol);
}

function buildTrade(
  open: RobinhoodFill,
  close: RobinhoodFill,
  quantity: number,
  pnl: number,
): ParsedTradeInput {
  const option = open.contract !== null;
  return {
    date: close.date,
    // See the Trade type: `date` is the close everywhere, so the open is carried separately.
    openDate: open.date,
    symbol: open.symbol,
    pnl: Math.round(pnl * 100) / 100,
    /*
     * From the OPENING fill.
     *
     * Taken off the close — as it was — a buy-to-close read as a long and every credit trade in the
     * file came out the opposite of what it was. With direction in the queue key the two now agree
     * by construction, so this is no longer the line holding it up; it is kept because it says what
     * is actually true of the position, and the key could change.
     */
    side: open.direction,
    quantity,
    contract: open.contract ?? open.symbol,
    assetType: option ? 'option' : 'stock',
    optionType: option ? optionTypeOf(open.description) : undefined,
    notes: open.description || undefined,
  };
}

function namesAnOption(description: string): boolean {
  return /\b(call|put)\b/i.test(description);
}

function optionTypeOf(description: string): 'call' | 'put' | undefined {
  if (/\bcall\b/i.test(description)) return 'call';
  if (/\bput\b/i.test(description)) return 'put';
  return undefined;
}

/**
 * The activity date, as a plain calendar date.
 *
 * Built from the digits, never through `new Date(raw).toISOString()`. That round trip reads the
 * string as local midnight and then prints it in UTC, so for anyone east of UTC every imported
 * trade moved back a day — and the unit tests would not have caught it either, because this
 * machine runs UTC. Returns null for anything it cannot read, so the caller can skip the row.
 */
function parseRobinhoodDate(raw: string): string | null {
  const trimmed = raw.trim();

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(trimmed);
  if (slashed) {
    const [, month, day, year] = slashed;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

function extractSymbol(text: string): string {
  const match = /\b([A-Z]{1,5})\b/.exec(text);
  return match?.[1] ?? '';
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[$,()]/g, '').trim();
  // Parentheses are how this export writes a debit; a leading minus is how some rows write it.
  const negative = raw.includes('(') || raw.trimStart().startsWith('-');
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
