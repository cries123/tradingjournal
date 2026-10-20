import { describe, expect, it } from 'vitest';
import { bollinger, ema, heikinAshi, macd, openingRange, points, rsi, sma, vwap } from './indicators';
import { readDrawings, snapTime } from './replayDrawings';
import { DEFAULT_PARAMS, drawdown, runStrategy } from './replayStrategies';
import { buildStudies, DEFAULT_STUDIES, readStudies } from './replayStudies';
import type { Bar } from './marketReplay';

/* The replay chart's studies and strategy tester, against figures worked out by hand. */

const START = 1_792_157_400; // 2026-10-16 13:30Z, the open
const bar = (i: number, close: number, extra: Partial<Bar> = {}): Bar => ({
  time: START + i * 60,
  open: close,
  high: close + 0.1,
  low: close - 0.1,
  close,
  volume: 100,
  ...extra,
});
const series = (closes: number[]) => closes.map((c, i) => bar(i, c));

describe('moving averages', () => {
  it('waits for a full window, then averages it', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('seeds the EMA with the SMA of its first window, as TradingView does', () => {
    expect(ema([1, 2, 3, 4, 5, 6], 3)).toEqual([null, null, 2, 3, 4, 5]);
  });

  it('draws Bollinger Bands on the window’s standard deviation, flat for a flat price', () => {
    const flat = bollinger([5, 5, 5, 5], 2, 2);
    expect(flat.upper.slice(1)).toEqual([5, 5, 5]);
    const wide = bollinger([1, 3], 2, 2);
    expect(wide.mid[1]).toBe(2);
    expect(wide.upper[1]).toBe(4);
    expect(wide.lower[1]).toBe(0);
  });
});

describe('oscillators', () => {
  it('reads RSI as 100 when every change is up, and 0 when every change is down', () => {
    const up = rsi([1, 2, 3, 4, 5, 6], 3);
    expect(up.slice(0, 3)).toEqual([null, null, null]);
    expect(up[3]).toBe(100);
    expect(rsi([6, 5, 4, 3, 2], 3)[3]).toBe(0);
  });

  it('uses Wilder’s smoothing after the first window', () => {
    // Changes +1, -1, +1, then +1: first averages 2/3 and 1/3, then (2/3*2 + 1)/3 = 7/9 and (1/3*2)/3 = 2/9.
    const r = rsi([10, 11, 10, 11, 12], 3);
    expect(r[3]).toBeCloseTo(100 - 100 / (1 + 2), 6);
    expect(r[4]).toBeCloseTo(100 - 100 / (1 + 7 / 2), 6);
  });

  it('builds MACD from the two EMAs and signals off its own line', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const m = macd(closes, 3, 6, 4);
    expect(m.macd.findIndex((v) => v !== null)).toBe(5);
    expect(m.signal.findIndex((v) => v !== null)).toBe(8);
    // A steady rise settles the gap between the EMAs, so the histogram settles to zero.
    expect(m.hist[39]).toBeCloseTo(0, 6);
  });
});

describe('session levels', () => {
  it('weights VWAP by volume', () => {
    const v = vwap([bar(0, 10, { volume: 100, high: 10, low: 10 }), bar(1, 20, { volume: 300, high: 20, low: 20 })]);
    expect(v[1]).toBe(17.5);
  });

  it('prices VWAP on the typical price, not the close', () => {
    expect(vwap([bar(0, 10, { high: 13, low: 10 })])[0]).toBe(11);
  });

  it('sets the opening range only once its minutes are complete', () => {
    const bars = series([10, 12, 9, 11, 13, 10]);
    expect(openingRange(bars.slice(0, 2), START, 5)).toBeNull();
    expect(openingRange(bars, START, 5)).toEqual({ high: 13.1, low: 8.9, end: START + 300 });
  });

  it('smooths candles into Heikin Ashi and keeps their times', () => {
    const ha = heikinAshi([bar(0, 10, { open: 9, high: 11, low: 8 }), bar(1, 12, { open: 10, high: 13, low: 9 })]);
    expect(ha[0]).toMatchObject({ open: 9.5, close: 9.5 });
    expect(ha[1]).toMatchObject({ time: START + 60, open: 9.5, close: 11 });
  });

  it('drops the warm-up when turning a series into points', () => {
    expect(points(series([1, 2, 3]), [null, 2, 3]).map((p) => p.value)).toEqual([2, 3]);
  });
});

describe('the strategy tester', () => {
  it('buys the EMA cross up, sells the cross down, and books the points', () => {
    const closes = [10, 10, 10, 10, 11, 12, 13, 14, 13, 12, 11, 10, 9];
    const r = runStrategy('ema-cross', series(closes), START, { ...DEFAULT_PARAMS, fast: 2, slow: 4 });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ side: 'long', entryPrice: 11, open: false });
    expect(r.net).toBeCloseTo(r.trades[0].exitPrice - 11, 6);
  });

  it('only shorts when asked to', () => {
    // Up through the cross, then down through it: long-only exits there, long-and-short reverses.
    const closes = [10, 10, 10, 10, 11, 12, 13, 12, 11, 10, 9, 8];
    const longOnly = runStrategy('ema-cross', series(closes), START, { ...DEFAULT_PARAMS, fast: 2, slow: 4 });
    const both = runStrategy('ema-cross', series(closes), START, { ...DEFAULT_PARAMS, fast: 2, slow: 4, shorts: true });
    expect(longOnly.trades.map((t) => t.side)).toEqual(['long']);
    expect(both.trades.map((t) => t.side)).toEqual(['long', 'short']);
    expect(both.trades[1].open).toBe(true);
  });

  it('marks a position still open at the last bar shown, rather than inventing an exit', () => {
    const r = runStrategy('ema-cross', series([10, 10, 10, 10, 11, 12, 13]), START, { ...DEFAULT_PARAMS, fast: 2, slow: 4 });
    expect(r.trades.at(-1)?.open).toBe(true);
  });

  it('trades the opening-range breakout once, with the range’s far side as the stop', () => {
    // A 3-minute range of 9.9–10.1, a break up at 10.5, then a close back under 9.9 stops it out.
    const r = runStrategy('orb', series([10, 10, 10, 10.5, 11, 9.5, 12]), START, { ...DEFAULT_PARAMS, orMinutes: 3 });
    expect(r.trades).toEqual([
      expect.objectContaining({ side: 'long', entryPrice: 10.5, exitPrice: 9.5, open: false }),
    ]);
    expect(r.losses).toBe(1);
    expect(r.maxDrawdown).toBeCloseTo(1, 6);
  });

  it('crosses VWAP both ways when shorts are on', () => {
    const r = runStrategy('vwap-cross', series([10, 10, 11, 12, 10, 8]), START, { ...DEFAULT_PARAMS, shorts: true });
    expect(r.trades.map((t) => t.side)).toEqual(['long', 'short']);
  });

  it('measures drawdown from the best the running total reached, not from zero', () => {
    // Up 3, then down 1 and 2: the total never goes below zero, but it fell 3 from its high.
    expect(drawdown([3, -1, -2, 1])).toBe(3);
    expect(drawdown([-1, -1])).toBe(2);
    expect(drawdown([])).toBe(0);
  });
});

describe('studies', () => {
  const day = series(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 3));

  it('draws what is switched on, and a length it cannot use falls back to the default', () => {
    const out = buildStudies(day, START, {
      ...DEFAULT_STUDIES,
      ema1: { on: true, length: 0 },
      ema2: { on: false, length: 21 },
      rsi: { on: true, length: 14 },
      macd: { ...DEFAULT_STUDIES.macd, on: true },
    });
    expect(out.overlays.map((o) => o.label)).toEqual(['EMA 9', 'VWAP']);
    expect(out.panes.map((p) => [p.id, p.guides])).toEqual([
      ['rsi', [30, 70]],
      ['macd', [0]],
    ]);
  });

  it('draws the opening range only once its minutes are over', () => {
    const on = { ...DEFAULT_STUDIES, or: { on: true, minutes: 15 } };
    expect(buildStudies(day.slice(0, 10), START, on).levels).toEqual([]);
    expect(buildStudies(day, START, on).levels.map((l) => l.title)).toEqual(['OR15 high', 'OR15 low']);
  });

  it('reads saved choices over the defaults, ignoring anything of the wrong type', () => {
    const read = readStudies(JSON.stringify({ rsi: { on: true, length: '7' }, sma: { on: true }, junk: { on: true } }));
    expect(read.rsi).toEqual({ on: true, length: 14 });
    expect(read.sma).toEqual({ on: true, length: 50 });
    expect(read.ema1).toEqual(DEFAULT_STUDIES.ema1);
    expect('junk' in read).toBe(false);
    expect(readStudies('{nope')).toBe(DEFAULT_STUDIES);
  });
});

describe('drawings', () => {
  it('lands a point on the candle it falls in at a coarser timeframe', () => {
    expect(snapTime(START + 4 * 60, 5)).toBe(Math.floor((START + 240) / 300) * 300);
    expect(snapTime(START + 60, 1)).toBe(START + 60);
  });

  it('reads back only well-formed drawings', () => {
    const good = [
      { id: '1', kind: 'hline', a: { time: 1, price: 5 } },
      { id: '2', kind: 'trend', a: { time: 1, price: 5 }, b: { time: 2, price: 6 } },
    ];
    const bad = [{ id: '3', kind: 'trend', a: { time: 1, price: 5 } }, { id: '4', kind: 'circle', a: { time: 1, price: 5 } }];
    expect(readDrawings(JSON.stringify([...good, ...bad]))).toEqual(good);
    expect(readDrawings('{not json')).toEqual([]);
    expect(readDrawings(null)).toEqual([]);
  });
});
