import type { Trade } from '../types';
import type { Bar } from './marketReplay';
import { tradeMinute } from './replayClock';
import { multiplierFor } from './replayPractice';

/**
 * A trade laid over the minute bars of what it traded: where it sat in the session, the best and
 * worst it saw while open, what the contract did after it was closed, and what a stop or a target
 * would have done to it.
 *
 * Computed only from bars already bought for market replay, so none of it buys data. Pure, so the
 * screens show exactly what the tests pin.
 *
 * The honest limit: Schwab sends the day of a trade but not the minute, and most of this journal's
 * trades come from Schwab. Where a trade has no times, it is placed at the first minute its entry
 * price traded and the first minute after that its exit price traded — the earliest placement the
 * prices allow — and everything computed from that placement says it is an estimate. A trade whose
 * prices never traded on that contract that day is not placed at all rather than placed somewhere.
 */

export interface Placement {
  /** Index into the bars of the minute the trade opened in, and the minute it closed in. */
  entry: number;
  exit: number;
  /** Placed from its prices rather than from times the broker sent. */
  estimated: boolean;
}

type PricedTrade = Pick<Trade, 'date' | 'side' | 'tradePrice' | 'exitPrice' | 'quantity' | 'entryTime' | 'exitTime' | 'assetType' | 'optionType' | 'openDate'>;

function multiplier(t: PricedTrade): number {
  return multiplierFor(t.assetType === 'option' || t.optionType ? 'option' : 'stock');
}

function units(t: PricedTrade): number {
  return (t.quantity ?? 0) > 0 ? (t.quantity as number) : 1;
}

/** +1 for a long, −1 for a short: the direction a price move pays the trade. */
function sign(t: PricedTrade): 1 | -1 {
  return t.side === 'short' ? -1 : 1;
}

/** The bar a time falls in: the last bar at or before it, or the first bar for a time before the open. */
function barAt(bars: Bar[], time: number): number {
  let found = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].time <= time) found = i;
    else break;
  }
  return found;
}

const trades = (b: Bar, price: number) => b.low <= price && price <= b.high;

export function placeTrade(t: PricedTrade, bars: Bar[]): Placement | null {
  if (bars.length === 0 || t.tradePrice == null || t.exitPrice == null) return null;
  // A position carried overnight opened on another day's bars, which are not these.
  if (t.openDate && t.openDate !== t.date) return null;

  const entryAt = tradeMinute(t.date, t.entryTime);
  const exitAt = tradeMinute(t.date, t.exitTime);
  if (entryAt !== null && exitAt !== null && exitAt >= entryAt) {
    return { entry: barAt(bars, entryAt), exit: barAt(bars, exitAt), estimated: false };
  }

  const entryPrice = t.tradePrice;
  const exitPrice = t.exitPrice;
  const entry = entryAt !== null ? barAt(bars, entryAt) : bars.findIndex((b) => trades(b, entryPrice));
  if (entry < 0) return null;
  const after = bars.slice(entry).findIndex((b) => trades(b, exitPrice));
  if (after < 0) return null;
  return { entry, exit: entry + after, estimated: true };
}

/** The most the trade was against you and in your favor while it was open, in dollars, both ≥ 0. */
export function excursion(t: PricedTrade, bars: Bar[], p: Placement): { mae: number; mfe: number } | null {
  if (t.tradePrice == null) return null;
  const open = bars.slice(p.entry, p.exit + 1);
  if (open.length === 0) return null;
  const high = Math.max(...open.map((b) => b.high));
  const low = Math.min(...open.map((b) => b.low));
  const scale = multiplier(t) * units(t);
  const favorable = sign(t) === 1 ? high - t.tradePrice : t.tradePrice - low;
  const adverse = sign(t) === 1 ? t.tradePrice - low : high - t.tradePrice;
  return { mae: Math.max(0, adverse) * scale, mfe: Math.max(0, favorable) * scale };
}

export interface AfterExit {
  /** How much more the rest of the session would have paid at its best, in dollars, ≥ 0. */
  more: number;
  /** How much worse it got at its worst — what closing saved — in dollars, ≥ 0. */
  avoided: number;
  /** Holding to the last bar of the session instead, in dollars, either sign. */
  toClose: number;
  bestPrice: number;
  worstPrice: number;
  closePrice: number;
}

export function afterExit(t: PricedTrade, bars: Bar[], p: Placement): AfterExit | null {
  if (t.exitPrice == null) return null;
  const rest = bars.slice(p.exit + 1);
  if (rest.length === 0) return null;
  const high = Math.max(...rest.map((b) => b.high));
  const low = Math.min(...rest.map((b) => b.low));
  const close = rest[rest.length - 1].close;
  const scale = multiplier(t) * units(t);
  const long = sign(t) === 1;
  return {
    more: Math.max(0, long ? high - t.exitPrice : t.exitPrice - low) * scale,
    avoided: Math.max(0, long ? t.exitPrice - low : high - t.exitPrice) * scale,
    toClose: (close - t.exitPrice) * sign(t) * scale,
    bestPrice: long ? high : low,
    worstPrice: long ? low : high,
    closePrice: close,
  };
}

/** What the trade panel shows under "After you closed it". */
export type AfterExitView =
  | { state: 'measured'; after: AfterExit; estimated: boolean }
  /** The day was never opened in market replay, so its bars were never bought. */
  | { state: 'not-stored' }
  /** The trade's prices never traded on that contract that day. */
  | { state: 'unplaced' }
  /** Closed in the session's last minute: there is no "after". */
  | { state: 'end-of-day' }
  | { state: 'loading' };

/** Null where there is nothing to say: a trade these measurements cannot place by kind. */
export function afterExitView(t: Trade, bars: Bar[] | null | undefined, loading: boolean): AfterExitView | null {
  if (bars === undefined) return loading ? { state: 'loading' } : null;
  if (bars === null) return { state: 'not-stored' };
  const placed = placeTrade(t, bars);
  if (!placed) return { state: 'unplaced' };
  const after = afterExit(t, bars, placed);
  return after ? { state: 'measured', after, estimated: placed.estimated } : { state: 'end-of-day' };
}

export interface BracketRule {
  /** Exit when the premium has lost this share of the entry price, e.g. 0.3. Null for no stop. */
  stop: number | null;
  /** Exit when the premium has gained this share, e.g. 0.5. Null for no target. */
  target: number | null;
}

export interface BracketResult {
  how: 'stop' | 'target' | 'as-traded';
  exitPrice: number;
  /** The trade's P&L under the rule: its real P&L moved by the change in exit price. Fees unchanged. */
  pnl: number;
}

/**
 * The trade as taken, with a stop and a target added.
 *
 * Only the minutes the trade was really open are searched, from the minute after the entry (the
 * entry's own minute holds prices from before the fill) to the exit's. A rule can only end the trade
 * sooner; if neither level is touched it closes as it really did. When one minute touches both, the
 * stop is assumed to have come first — one-minute bars cannot say which did, and assuming the
 * flattering one would make every bracket look better than it was.
 */
export function bracketTrade(t: Trade, bars: Bar[], p: Placement, rule: BracketRule): BracketResult | null {
  if (t.tradePrice == null || t.exitPrice == null) return null;
  const long = sign(t) === 1;
  const entry = t.tradePrice;
  const stop = rule.stop != null && rule.stop > 0 ? entry * (long ? 1 - rule.stop : 1 + rule.stop) : null;
  const target = rule.target != null && rule.target > 0 ? entry * (long ? 1 + rule.target : 1 - rule.target) : null;
  const scale = multiplier(t) * units(t);
  const at = (exitPrice: number, how: BracketResult['how']): BracketResult => ({
    how,
    exitPrice,
    pnl: t.pnl + (exitPrice - (t.exitPrice as number)) * sign(t) * scale,
  });

  for (let i = p.entry + 1; i <= p.exit && i < bars.length; i++) {
    const b = bars[i];
    if (stop !== null && (long ? b.low <= stop : b.high >= stop)) return at(stop, 'stop');
    if (target !== null && (long ? b.high >= target : b.low <= target)) return at(target, 'target');
  }
  return at(t.exitPrice, 'as-traded');
}

export interface BracketSummary {
  tested: number;
  estimated: number;
  actualNet: number;
  ruleNet: number;
  stopped: number;
  targeted: number;
}

export function summarizeBrackets(rows: { trade: Trade; result: BracketResult; estimated: boolean }[]): BracketSummary {
  return rows.reduce<BracketSummary>(
    (s, r) => ({
      tested: s.tested + 1,
      estimated: s.estimated + (r.estimated ? 1 : 0),
      actualNet: s.actualNet + r.trade.pnl,
      ruleNet: s.ruleNet + r.result.pnl,
      stopped: s.stopped + (r.result.how === 'stop' ? 1 : 0),
      targeted: s.targeted + (r.result.how === 'target' ? 1 : 0),
    }),
    { tested: 0, estimated: 0, actualNet: 0, ruleNet: 0, stopped: 0, targeted: 0 },
  );
}

export interface PlacedTrade {
  trade: Trade;
  bars: Bar[];
  placement: Placement;
}

export interface Measurement {
  placed: PlacedTrade[];
  /** MAE and MFE in dollars for every placed trade, by trade id. */
  excursions: Map<string, { mae: number; mfe: number }>;
  /** Trades whose day was never opened in market replay, so there is nothing to measure them with yet. */
  notStored: number;
  /** Placed from their prices, without times. */
  estimated: number;
}

/** Every trade that can be laid over stored bars, and what that says about each. */
export function measureTrades(list: Trade[], barsFor: (t: Trade) => Bar[] | null | undefined): Measurement {
  const placed: PlacedTrade[] = [];
  const excursions = new Map<string, { mae: number; mfe: number }>();
  let notStored = 0;
  for (const trade of list) {
    const bars = barsFor(trade);
    if (bars === null) notStored += 1;
    if (!bars) continue;
    const placement = placeTrade(trade, bars);
    if (!placement) continue;
    placed.push({ trade, bars, placement });
    const ex = excursion(trade, bars, placement);
    if (ex) excursions.set(trade.id, ex);
  }
  return { placed, excursions, notStored, estimated: placed.filter((p) => p.placement.estimated).length };
}

/**
 * The trades with measured MAE and MFE filled in where the trader recorded none.
 *
 * A number somebody typed always wins over one measured: they saw their own fills. The trades are
 * copies; nothing is written back to the journal, so a measurement can never overwrite a record.
 */
export function withMeasuredExcursions(
  list: Trade[],
  measured: ReadonlyMap<string, { mae: number; mfe: number }>,
): { trades: Trade[]; filled: number } {
  let filled = 0;
  const out = list.map((t) => {
    const m = measured.get(t.id);
    if (!m) return t;
    const needMae = typeof t.mae !== 'number' || !Number.isFinite(t.mae);
    const needMfe = typeof t.mfe !== 'number' || !Number.isFinite(t.mfe);
    if (!needMae && !needMfe) return t;
    filled += 1;
    return { ...t, ...(needMae ? { mae: m.mae } : {}), ...(needMfe ? { mfe: m.mfe } : {}) };
  });
  return { trades: out, filled };
}
