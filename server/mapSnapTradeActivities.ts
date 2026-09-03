import type { ParsedTradeInput, TradeSide } from '../src/types';

/**
 * Maps a SnapTrade UniversalActivity feed into round-trip trades (opens paired with closes,
 * P&L computed per trade) the same way the CSV importers do for Schwab/Thinkorswim exports.
 *
 * We only accept BUY/SELL rows here — dividends, fees, transfers, and option expiration/
 * assignment/exercise events are skipped rather than guessed at.
 *
 * Options carry an explicit open/close flag from the brokerage (option_type: BUY_TO_OPEN,
 * SELL_TO_CLOSE, etc.), so those are matched exactly like the Schwab CSV parser.
 * Stocks don't carry that flag from SnapTrade, so those are matched with a running FIFO
 * position tracker: a BUY/SELL that has no opposite-side inventory to close opens a new lot;
 * one that does, closes against it (and can flip through flat into a new lot on the far side).
 */

interface RawActivity {
  id: string;
  tradeDate: string;
  units: number;
  price: number;
  fee: number;
  side: 'BUY' | 'SELL';
  isOption: boolean;
  underlyingSymbol: string;
  optionTicker?: string;
  optionType?: 'CALL' | 'PUT';
  strike?: number;
  expiration?: string;
  positionEffect?: 'OPEN' | 'CLOSE';
  accountId: string;
  accountName?: string;
}

// Loose shape matching the fields we read off SnapTrade's UniversalActivity — kept minimal
// and untyped-against-the-SDK so this stays easy to feed test fixtures without the full SDK types.
export interface SnapTradeActivityLike {
  id?: string;
  account?: { id?: string; name?: string | null };
  symbol?: { symbol?: string; raw_symbol?: string } | null;
  option_symbol?: {
    ticker?: string;
    option_type?: 'CALL' | 'PUT';
    strike_price?: number;
    expiration_date?: string;
    underlying_symbol?: { symbol?: string; raw_symbol?: string };
  } | null;
  price?: number;
  units?: number;
  type?: string;
  option_type?: string;
  trade_date?: string | null;
  fee?: number;
}

/**
 * A stable id for an activity SnapTrade didn't give one.
 *
 * This function used to end in `Math.random()`, and that single call is why journals kept
 * duplicating no matter what else was fixed.
 *
 * The id ends up inside the trade's sourceId (`snaptrade:<open>:<close>`), which is the ONLY thing
 * dedupe compares. A random component means the same real fill gets a different sourceId on every
 * sync — so "have I already imported this?" is always answered no, and every sync re-imports the
 * entire history. Removing the automatic sync only reduced how often that happened; it never
 * touched the cause, because a manual sync duplicates just as thoroughly.
 *
 * The replacement is derived purely from the fill's own values, so the same activity always
 * produces the same id. `seen` disambiguates genuinely identical fills — two 100-share buys of the
 * same symbol at the same price and time are two real fills, and they need different ids — by
 * counting occurrences in input order. That stays stable across syncs because it depends on the
 * data, not on when the sync ran.
 */
function fallbackActivityId(a: SnapTradeActivityLike, seen: Map<string, number>): string {
  const key = [
    a.trade_date ?? '',
    a.account?.id ?? '',
    a.option_symbol?.ticker
      ?? a.symbol?.symbol
      ?? a.symbol?.raw_symbol
      ?? '',
    (a.type ?? '').toUpperCase(),
    (a.option_type ?? '').toUpperCase(),
    a.units ?? '',
    a.price ?? '',
    a.fee ?? '',
  ].join('|');

  const n = seen.get(key) ?? 0;
  seen.set(key, n + 1);
  // The occurrence index only appears when it has to, so the common case stays readable in logs.
  return n === 0 ? `derived:${key}` : `derived:${key}#${n}`;
}

function normalize(activities: SnapTradeActivityLike[]): RawActivity[] {
  const out: RawActivity[] = [];
  const seen = new Map<string, number>();

  for (const a of activities) {
    const type = (a.type || '').toUpperCase();
    if (type !== 'BUY' && type !== 'SELL') continue;
    if (!a.trade_date || typeof a.price !== 'number' || typeof a.units !== 'number') continue;

    const isOption = Boolean(a.option_symbol);
    const optionAction = (a.option_type || '').toUpperCase();

    let positionEffect: 'OPEN' | 'CLOSE' | undefined;
    if (isOption) {
      if (optionAction.includes('OPEN')) positionEffect = 'OPEN';
      else if (optionAction.includes('CLOSE')) positionEffect = 'CLOSE';
      else continue; // can't safely place an option fill without an open/close flag
    }

    out.push({
      id: a.id || fallbackActivityId(a, seen),
      tradeDate: a.trade_date,
      units: Math.abs(a.units),
      price: a.price,
      fee: typeof a.fee === 'number' ? a.fee : 0,
      side: type,
      isOption,
      underlyingSymbol: (
        a.option_symbol?.underlying_symbol?.symbol ||
        a.option_symbol?.underlying_symbol?.raw_symbol ||
        a.symbol?.symbol ||
        a.symbol?.raw_symbol ||
        'UNKNOWN'
      ).toUpperCase(),
      optionTicker: a.option_symbol?.ticker,
      optionType: a.option_symbol?.option_type,
      strike: a.option_symbol?.strike_price,
      expiration: a.option_symbol?.expiration_date,
      positionEffect,
      accountId: a.account?.id || 'unknown',
      accountName: a.account?.name || undefined,
    });
  }

  out.sort((x, y) => x.tradeDate.localeCompare(y.tradeDate) || x.id.localeCompare(y.id));
  return out;
}

interface OpenLot {
  /** Signed quantity: positive = long inventory, negative = short inventory. */
  qty: number;
  price: number;
  /**
   * The entry fee still unattributed — drawn down as the lot is closed.
   *
   * It has to shrink with the lot. Prorating a fixed fee against `qty` while `qty` was being
   * decremented meant the denominator got smaller while the numerator stayed whole, so an entry
   * closed in two exits was charged its commission at 50% and then again at 100%. Buy 100 with a
   * $10 commission, sell 50 and 50, and the journal booked $15 of entry fees against the $10 paid.
   * Scaling out of a position is ordinary trading, so this was wrong for most real accounts and
   * invisible in test data, where every fill closes in one go.
   */
  fee: number;
  open: RawActivity;
}

/**
 * Takes this exit's share of a lot's remaining entry fee, and consumes it.
 *
 * Prorating against what is left, then subtracting, makes the shares across every exit sum to
 * exactly the fee that was paid — whatever order or sizes the exits come in.
 */
function drawEntryFee(lot: OpenLot, matched: number, lotRemaining: number): number {
  if (lotRemaining <= 0) return 0;
  const share = lot.fee * (matched / lotRemaining);
  lot.fee -= share;
  return share;
}

/**
 * Extracts a local "HH:MM" time-of-day from a SnapTrade activity's trade_date, converted to US
 * Eastern time — the standard equities/options session clock the app's market-session heuristic
 * already assumes (see marketSessionFromTime in src/utils/tradeHelpers.ts) and the same convention
 * the manual trade-entry form uses. Returns undefined when the source only carries a bare date
 * with no real time component: some brokerages report activities with no time-of-day granularity
 * at all, which SnapTrade represents as an exact UTC midnight, so we don't show a fabricated 00:00.
 */
function extractEasternTime(isoOrDate: string): string | undefined {
  if (!isoOrDate.includes('T')) return undefined;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return undefined;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh}:${mm}`;
}

function buildTrade(
  open: RawActivity,
  close: RawActivity,
  qty: number,
  pnl: number,
  grossPnl: number,
  fee: number,
  side: TradeSide,
): ParsedTradeInput {
  const contract = open.isOption
    ? `${open.underlyingSymbol} ${open.expiration ?? ''} ${open.strike ?? ''} ${(open.optionType ?? '').charAt(0)}`.trim()
    : open.underlyingSymbol;

  return {
    symbol: open.underlyingSymbol,
    pnl: Math.round(pnl * 100) / 100,
    date: close.tradeDate.slice(0, 10),
    side,
    contract,
    assetType: open.isOption ? 'option' : 'stock',
    optionType: open.optionType === 'PUT' ? 'put' : open.optionType === 'CALL' ? 'call' : undefined,
    expiration: open.expiration,
    strike: open.strike,
    quantity: qty,
    // Broker-verified execution data pulled from SnapTrade and stored as structured fields — shown
    // as labeled rows in the trade detail view (TradeDetails.tsx) rather than crammed into notes.
    tradePrice: open.price,
    exitPrice: close.price,
    entryTime: extractEasternTime(open.tradeDate),
    exitTime: extractEasternTime(close.tradeDate),
    fees: Math.round(fee * 100) / 100,
    grossPnl: Math.round(grossPnl * 100) / 100,
    accountType: open.accountName,
    // Stable across re-syncs (SnapTrade's own activity ids for the open/close fills), so importing
    // the same round-trip twice — e.g. clicking Sync trades again — is a no-op instead of a duplicate.
    sourceId: `snaptrade:${open.id}:${close.id}`,
  };
}

function matchOptions(activities: RawActivity[]): ParsedTradeInput[] {
  const openLots = new Map<string, OpenLot[]>();
  const trades: ParsedTradeInput[] = [];

  for (const exec of activities) {
    const key = `${exec.accountId}|${exec.optionTicker}`;
    if (!openLots.has(key)) openLots.set(key, []);

    if (exec.positionEffect === 'OPEN') {
      openLots.get(key)!.push({ qty: exec.units, price: exec.price, fee: exec.fee, open: exec });
      continue;
    }

    let remaining = exec.units;
    const queue = openLots.get(key)!;

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const matched = Math.min(remaining, lot.qty);
      const mult = 100;

      const grossPnl =
        exec.side === 'SELL'
          ? (exec.price - lot.price) * matched * mult
          : (lot.price - exec.price) * matched * mult;

      const feeShare = drawEntryFee(lot, matched, lot.qty) + exec.fee * (matched / exec.units);
      const pnl = grossPnl - feeShare;
      const side: TradeSide = lot.open.side === 'BUY' ? 'long' : 'short';

      trades.push(buildTrade(lot.open, exec, matched, pnl, grossPnl, feeShare, side));

      lot.qty -= matched;
      remaining -= matched;
      if (lot.qty <= 0.0001) queue.shift();
    }
  }

  return trades;
}

function matchStocks(activities: RawActivity[]): ParsedTradeInput[] {
  const queues = new Map<string, OpenLot[]>();
  const trades: ParsedTradeInput[] = [];

  for (const exec of activities) {
    const key = `${exec.accountId}|${exec.underlyingSymbol}`;
    if (!queues.has(key)) queues.set(key, []);
    const queue = queues.get(key)!;

    const execSign = exec.side === 'BUY' ? 1 : -1;
    let remaining = exec.units;

    while (remaining > 0 && queue.length > 0 && Math.sign(queue[0].qty) === -execSign) {
      const lot = queue[0];
      const lotAbs = Math.abs(lot.qty);
      const matched = Math.min(remaining, lotAbs);
      const lotSign = Math.sign(lot.qty);

      const grossPnl = (exec.price - lot.price) * matched * lotSign;
      const feeShare = drawEntryFee(lot, matched, lotAbs) + exec.fee * (matched / exec.units);
      const pnl = grossPnl - feeShare;
      const side: TradeSide = lotSign > 0 ? 'long' : 'short';

      trades.push(buildTrade(lot.open, exec, matched, pnl, grossPnl, feeShare, side));

      lot.qty -= lotSign * matched;
      remaining -= matched;
      if (Math.abs(lot.qty) <= 0.0001) queue.shift();
    }

    if (remaining > 0.0001) {
      queue.push({ qty: execSign * remaining, price: exec.price, fee: exec.fee * (remaining / exec.units), open: exec });
    }
  }

  return trades;
}

export function mapSnapTradeActivitiesToTrades(activities: SnapTradeActivityLike[]): ParsedTradeInput[] {
  const normalized = normalize(activities);
  const options = normalized.filter((a) => a.isOption);
  const stocks = normalized.filter((a) => !a.isOption);

  return [...matchOptions(options), ...matchStocks(stocks)].sort((a, b) => a.date.localeCompare(b.date));
}
