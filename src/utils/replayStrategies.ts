import type { Bar } from './marketReplay';
import { ema, openingRange, vwap } from './indicators';

/**
 * The strategy tester: a rule run over the session the replay has shown, the way TradingView's
 * Strategy Tester runs one over a chart.
 *
 * Three rules a 0DTE trader actually uses, each judged at the close of a candle and filled at that
 * close, with no commission or slippage invented. It only sees the bars it is given, so during a
 * replay it cannot use a candle the trader has not seen yet. This tests a rule on one past day; it
 * is never a signal for the next one, and the screen says so.
 */

export type StrategyKind = 'ema-cross' | 'orb' | 'vwap-cross';

export interface StrategyParams {
  /** Fast and slow EMA lengths for the crossover. */
  fast: number;
  slow: number;
  /** Opening-range length in minutes. */
  orMinutes: number;
  /** Long only, or long and short. */
  shorts: boolean;
}

export const DEFAULT_PARAMS: StrategyParams = { fast: 9, slow: 21, orMinutes: 15, shorts: false };

export const STRATEGY_NAMES: Record<StrategyKind, string> = {
  'ema-cross': 'EMA crossover',
  orb: 'Opening range breakout',
  'vwap-cross': 'VWAP cross',
};

export interface StrategyTrade {
  side: 'long' | 'short';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  /** Price change in the trade's favour, per share or per contract point. */
  points: number;
  /** Still open at the last bar shown: marked at its close, not exited. */
  open: boolean;
}

export interface StrategyResult {
  trades: StrategyTrade[];
  /** Sum of points across trades. */
  net: number;
  wins: number;
  losses: number;
  /** Largest fall in cumulative points from a peak, as a positive number. */
  maxDrawdown: number;
}

type Signal = 'long' | 'short' | 'flat' | null;

/**
 * Runs a position through a signal per bar: 'long' or 'short' enters (reversing if needed), 'flat'
 * exits, null holds. Shorts are skipped unless asked for; a short signal then only exits a long.
 */
function trade(bars: Bar[], signals: Signal[], shorts: boolean): StrategyTrade[] {
  const trades: StrategyTrade[] = [];
  let pos: { side: 'long' | 'short'; time: number; price: number } | null = null;
  const close = (b: Bar, open: boolean) => {
    if (!pos) return;
    const points = pos.side === 'long' ? b.close - pos.price : pos.price - b.close;
    trades.push({ side: pos.side, entryTime: pos.time, entryPrice: pos.price, exitTime: b.time, exitPrice: b.close, points, open });
    pos = null;
  };
  bars.forEach((b, i) => {
    const s = signals[i];
    if (s === null) return;
    const want = s === 'short' && !shorts ? 'flat' : s;
    if (want === 'flat') {
      close(b, false);
    } else if (!pos || pos.side !== want) {
      close(b, false);
      pos = { side: want, time: b.time, price: b.close };
    }
  });
  const last = bars[bars.length - 1];
  if (pos && last) close(last, true);
  return trades;
}

function emaCross(bars: Bar[], p: StrategyParams): Signal[] {
  const closes = bars.map((b) => b.close);
  const f = ema(closes, p.fast);
  const s = ema(closes, p.slow);
  return bars.map((_, i) => {
    if (i === 0 || f[i] === null || s[i] === null || f[i - 1] === null || s[i - 1] === null) return null;
    const above = (f[i] as number) > (s[i] as number);
    const wasAbove = (f[i - 1] as number) > (s[i - 1] as number);
    if (above === wasAbove) return null;
    return above ? 'long' : 'short';
  });
}

function vwapCross(bars: Bar[]): Signal[] {
  const line = vwap(bars);
  return bars.map((b, i) => {
    if (i === 0 || line[i] === null || line[i - 1] === null) return null;
    const above = b.close > (line[i] as number);
    const wasAbove = bars[i - 1].close > (line[i - 1] as number);
    if (above === wasAbove) return null;
    return above ? 'long' : 'short';
  });
}

/**
 * The first close outside the opening range enters that way; a close back through the other side
 * of the range is the stop. One entry per side per day, as the breakout is usually traded.
 */
function orb(bars: Bar[], sessionStart: number, p: StrategyParams): Signal[] {
  const range = openingRange(bars, sessionStart, p.orMinutes);
  const signals: Signal[] = bars.map(() => null);
  if (!range) return signals;
  let pos: 'long' | 'short' | null = null;
  const used = { long: false, short: false };
  bars.forEach((b, i) => {
    if (b.time < range.end) return;
    if (pos === 'long' && b.close < range.low) {
      signals[i] = 'flat';
      pos = null;
    } else if (pos === 'short' && b.close > range.high) {
      signals[i] = 'flat';
      pos = null;
    } else if (!pos && b.close > range.high && !used.long) {
      signals[i] = 'long';
      pos = 'long';
      used.long = true;
    } else if (!pos && b.close < range.low && !used.short && p.shorts) {
      signals[i] = 'short';
      pos = 'short';
      used.short = true;
    }
  });
  return signals;
}

/** The largest fall in the running total from the highest it had reached, which starts at zero. */
export function drawdown(results: number[]): number {
  let equity = 0;
  let peak = 0;
  let worst = 0;
  for (const r of results) {
    equity += r;
    peak = Math.max(peak, equity);
    worst = Math.max(worst, peak - equity);
  }
  return worst;
}

export function runStrategy(kind: StrategyKind, bars: Bar[], sessionStart: number, params: StrategyParams): StrategyResult {
  const signals = kind === 'ema-cross' ? emaCross(bars, params) : kind === 'vwap-cross' ? vwapCross(bars) : orb(bars, sessionStart, params);
  const trades = trade(bars, signals, params.shorts);
  return {
    trades,
    net: trades.reduce((s, t) => s + t.points, 0),
    wins: trades.filter((t) => t.points > 0).length,
    losses: trades.filter((t) => t.points < 0).length,
    maxDrawdown: drawdown(trades.map((t) => t.points)),
  };
}
