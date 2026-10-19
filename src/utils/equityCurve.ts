import type { Trade } from '../types';

/**
 * Running P&L by trading day, with the drawdown under it — the one chart every trader expects.
 *
 * The Overview had figures and no curve, by the decision that figures are what somebody can act
 * on. The decision holds for most charts and not for this one: "how has my year gone" is answered
 * by a line in a second and by a table never, and a drawdown shaded under the peak is the picture
 * of the number the Risk group states. Everything here is computed from a date and a P&L, so it
 * draws for every journal from every source.
 *
 * Pure: points and SVG paths, no React, so the maths and the geometry can be tested on their own.
 */

export interface EquityPoint {
  date: string;
  /** Cumulative P&L after this day. */
  equity: number;
  /** The highest equity seen so far, this day included. */
  peak: number;
  /** peak − equity: how far under the high-water mark the day ended. Zero at a new high. */
  drawdown: number;
}

export interface EquityCurve {
  points: EquityPoint[];
  maxDrawdown: number;
  /** The day the deepest drawdown bottomed out, or null when there was none. */
  trough: EquityPoint | null;
  final: number;
  high: number;
  low: number;
}

/** Fewer days than this is two dots and a guess, not a curve. */
export const MIN_CURVE_DAYS = 3;

export function equityCurve(trades: Trade[]): EquityCurve | null {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    if (typeof t.date !== 'string' || t.date.length < 10) continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.pnl);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (days.length < MIN_CURVE_DAYS) return null;

  const points: EquityPoint[] = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let trough: EquityPoint | null = null;
  for (const [date, pnl] of days) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const point = { date, equity, peak, drawdown: peak - equity };
    points.push(point);
    if (point.drawdown > maxDrawdown) {
      maxDrawdown = point.drawdown;
      trough = point;
    }
  }

  return {
    points,
    maxDrawdown,
    trough,
    final: equity,
    // Zero is always on the chart: a curve that starts at the origin and never shows it reads as
    // a different chart from the one next to it.
    high: Math.max(0, ...points.map((p) => p.equity)),
    low: Math.min(0, ...points.map((p) => p.equity)),
  };
}

export interface EquityGeometry {
  /** The equity line. */
  line: string;
  /** The line closed down to the zero axis, for the fill under it. */
  area: string;
  /** The band between the running peak and the equity, for the drawdown shading. */
  drawdownBand: string;
  /** y of the zero axis, in viewBox units. */
  zeroY: number;
  /** Where the deepest trough sits, for its marker. */
  trough: { x: number; y: number } | null;
  /** x and y for each point, in viewBox units. */
  xy: { x: number; y: number }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Lays the curve into a box. x runs from the first day to the last; y spans low..high with a
 * little headroom so the line never touches the frame.
 */
export function equityGeometry(curve: EquityCurve, width: number, height: number, pad = 6): EquityGeometry {
  const { points } = curve;
  const span = curve.high - curve.low || 1;
  const innerH = height - pad * 2;
  const x = (i: number) => (points.length === 1 ? width / 2 : (i / (points.length - 1)) * width);
  const y = (value: number) => pad + ((curve.high - value) / span) * innerH;

  // The line starts at zero, the day before the first trade, so the first day's result is visible
  // as a move rather than as a starting level.
  const xy = points.map((p, i) => ({ x: round(x(i)), y: round(y(p.equity)) }));
  const zeroY = round(y(0));

  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const area = `${line} L${xy[xy.length - 1]!.x} ${zeroY} L${xy[0]!.x} ${zeroY} Z`;

  const peaks = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))} ${round(y(p.peak))}`).join(' ');
  const back = [...xy].reverse().map((p) => `L${p.x} ${p.y}`).join(' ');
  const drawdownBand = `${peaks} ${back} Z`;

  const troughIndex = curve.trough ? points.indexOf(curve.trough) : -1;
  const trough = troughIndex >= 0 ? xy[troughIndex]! : null;

  return { line, area, drawdownBand, zeroY, trough, xy };
}
