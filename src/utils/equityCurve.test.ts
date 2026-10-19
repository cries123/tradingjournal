import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { equityCurve, equityGeometry, MIN_CURVE_DAYS } from './equityCurve';

const t = (date: string, pnl: number): Trade => ({ id: `${date}-${pnl}`, date, symbol: 'SPY', pnl }) as Trade;

describe('the equity curve', () => {
  it('runs the P&L forward by day and shades the fall from the high-water mark', () => {
    const curve = equityCurve([
      t('2026-08-03', 100),
      t('2026-08-03', 50), // same day, summed
      t('2026-08-04', -200),
      t('2026-08-05', 80),
      t('2026-08-06', 300),
    ])!;

    expect(curve.points.map((p) => p.equity)).toEqual([150, -50, 30, 330]);
    expect(curve.points.map((p) => p.peak)).toEqual([150, 150, 150, 330]);
    expect(curve.points.map((p) => p.drawdown)).toEqual([0, 200, 120, 0]);
    expect(curve.maxDrawdown).toBe(200);
    expect(curve.trough!.date).toBe('2026-08-04');
    expect(curve.final).toBe(330);
    // Zero is always on the chart.
    expect(curve.low).toBe(-50);
    expect(curve.high).toBe(330);
  });

  it('keeps zero in view for a journal that never went under', () => {
    const curve = equityCurve([t('2026-08-03', 100), t('2026-08-04', 100), t('2026-08-05', 100)])!;
    expect(curve.low).toBe(0);
    expect(curve.maxDrawdown).toBe(0);
    expect(curve.trough).toBeNull();
  });

  it(`is nothing under ${MIN_CURVE_DAYS} trading days, however many trades they hold`, () => {
    expect(equityCurve([t('2026-08-03', 1), t('2026-08-03', 2), t('2026-08-04', 3)])).toBeNull();
  });

  it('lays the line into the box with the drawdown band closed back along the equity', () => {
    const curve = equityCurve([t('2026-08-03', 100), t('2026-08-04', -200), t('2026-08-05', 300)])!;
    const g = equityGeometry(curve, 600, 160, 0);

    // x runs edge to edge; y puts the high at the top and the low at the bottom.
    expect(g.xy.map((p) => p.x)).toEqual([0, 300, 600]);
    expect(g.xy[2]!.y).toBe(0); // 200 is the high
    expect(g.xy[1]!.y).toBe(160); // −100 is the low
    expect(g.line).toBe('M0 53.33 L300 160 L600 0');
    expect(g.area.endsWith(`L600 ${g.zeroY} L0 ${g.zeroY} Z`)).toBe(true);
    // The band runs along the peaks and back along the equity.
    expect(g.drawdownBand.startsWith('M0 53.33 L300 53.33 L600 0')).toBe(true);
    expect(g.drawdownBand.endsWith('L300 160 L0 53.33 Z')).toBe(true);
    expect(g.trough).toEqual({ x: 300, y: 160 });
  });
});
