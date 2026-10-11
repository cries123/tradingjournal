import type { Trade } from '../../types';
import { simulateRules } from '../../utils/ruleSimulator';

/*
 * The rule-simulator demo's arithmetic, apart from landingDemo.ts so the simulator only loads with
 * the section that uses it — the hero imports landingDemo, and the hero is in the landing page's
 * first download.
 */

export interface DemoResult {
  actual: number;
  simulated: number;
  difference: number;
  daysChanged: number;
  tradesRemoved: number;
  /** Cumulative P&L at the close of each day, actual and with the cap. */
  actualCurve: number[];
  simulatedCurve: number[];
}

/** The sample journal replayed against a trade cap. `cap` null means no cap. */
export function demoResult(trades: Trade[], cap: number | null): DemoResult {
  const result = simulateRules(trades, cap ? { enabled: true, maxTradesPerDay: cap } : { enabled: true });
  const changed = new Map(result.changedDays.map((d) => [d.date, d.simulatedPnl]));

  const byDay = new Map<string, number>();
  for (const t of trades) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.pnl);

  const actualCurve: number[] = [];
  const simulatedCurve: number[] = [];
  let a = 0;
  let s = 0;
  for (const [date, pnl] of [...byDay.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    a += pnl;
    s += changed.get(date) ?? pnl;
    actualCurve.push(Math.round(a * 100) / 100);
    simulatedCurve.push(Math.round(s * 100) / 100);
  }

  return {
    actual: result.actualPnl,
    simulated: result.simulatedPnl,
    difference: result.difference,
    daysChanged: result.daysChanged,
    tradesRemoved: result.tradesRemoved,
    actualCurve,
    simulatedCurve,
  };
}

/** Curves in one coordinate space, as SVG polyline points, plus where zero falls. */
export function curvePoints(series: number[][], width: number, height: number): { lines: string[]; zeroY: number } {
  const all = series.flat().concat(0);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 10;
  const yOf = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const lines = series.map((values) =>
    values
      .map((v, i) => {
        const x = (i / Math.max(1, values.length - 1)) * width;
        const y = yOf(v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' '),
  );
  return { lines, zeroY: yOf(0) };
}
