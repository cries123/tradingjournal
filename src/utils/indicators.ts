import type { Bar } from './marketReplay';

/**
 * The replay chart's indicators, computed here so the chart only draws them.
 *
 * Standard definitions, the ones TradingView uses by default, so a number on this chart matches
 * the same study on theirs: EMA seeded with the SMA of its first `length` values, RSI with Wilder's
 * smoothing, MACD 12/26/9 on EMAs, Bollinger Bands on the population standard deviation. Every
 * series is the same length as its input, with null until there is enough data to compute it.
 */

export type Series = (number | null)[];

export function sma(values: number[], length: number): Series {
  const out: Series = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    out.push(i >= length - 1 ? sum / length : null);
  }
  return out;
}

export function ema(values: number[], length: number): Series {
  const out: Series = [];
  const k = 2 / (length + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      out.push(null);
    } else if (prev === null) {
      prev = values.slice(0, length).reduce((a, b) => a + b, 0) / length;
      out.push(prev);
    } else {
      prev = values[i] * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

export function bollinger(values: number[], length: number, mult: number): { mid: Series; upper: Series; lower: Series } {
  const mid = sma(values, length);
  const upper: Series = [];
  const lower: Series = [];
  for (let i = 0; i < values.length; i++) {
    const m = mid[i];
    if (m === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const window = values.slice(i - length + 1, i + 1);
    const sd = Math.sqrt(window.reduce((s, v) => s + (v - m) ** 2, 0) / length);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

/** RSI with Wilder's smoothing: the first average is a plain mean of `length` changes. */
export function rsi(values: number[], length: number): Series {
  const out: Series = values.length > 0 ? [null] : [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (i <= length) {
      gain += up;
      loss += down;
      if (i < length) {
        out.push(null);
        continue;
      }
      gain /= length;
      loss /= length;
    } else {
      gain = (gain * (length - 1) + up) / length;
      loss = (loss * (length - 1) + down) / length;
    }
    out.push(loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  }
  return out;
}

export function macd(values: number[], fast: number, slow: number, signal: number): { macd: Series; signal: Series; hist: Series } {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] !== null && s[i] !== null ? (f[i] as number) - (s[i] as number) : null));
  // The signal line is an EMA of the MACD line, over the part of it that exists.
  const first = line.findIndex((v) => v !== null);
  const sig: Series = values.map(() => null);
  if (first >= 0) {
    const tail = ema(line.slice(first) as number[], signal);
    tail.forEach((v, i) => {
      sig[first + i] = v;
    });
  }
  const hist: Series = values.map((_, i) => (line[i] !== null && sig[i] !== null ? (line[i] as number) - (sig[i] as number) : null));
  return { macd: line, signal: sig, hist };
}

/** VWAP from the session's first bar, on the typical price. */
export function vwap(bars: Bar[]): Series {
  let pv = 0;
  let v = 0;
  return bars.map((b) => {
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    v += b.volume;
    return v > 0 ? pv / v : null;
  });
}

/**
 * The high and low of the session's first `minutes`, once that range is complete.
 *
 * Null while the replay is still inside it: a level drawn before it is set would move as the bars
 * arrive, and an opening-range trader acts on the finished range, not a forming one.
 */
export function openingRange(bars: Bar[], sessionStart: number, minutes: number): { high: number; low: number; end: number } | null {
  const end = sessionStart + minutes * 60;
  const inside = bars.filter((b) => b.time < end);
  if (inside.length === 0 || !bars.some((b) => b.time >= end - 60)) return null;
  return { high: Math.max(...inside.map((b) => b.high)), low: Math.min(...inside.map((b) => b.low)), end };
}

/** Heikin Ashi candles: smoothed bars that keep the same times. */
export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const close = (b.open + b.high + b.low + b.close) / 4;
    const prev = out[out.length - 1];
    const open = prev ? (prev.open + prev.close) / 2 : (b.open + b.close) / 2;
    out.push({ time: b.time, open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), volume: b.volume });
  }
  return out;
}

/** A series as chart points, dropping the warm-up nulls. */
export function points(bars: Bar[], values: Series): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = [];
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) out.push({ time: bars[i].time, value: v });
  });
  return out;
}
