import { describe, expect, it } from 'vitest';
import { DRIFT_PX_PER_SEC, depthFor, driftedPosition, sway, wrap01 } from './starDrift';

const star = (x: number, y: number, depth = 1) => ({ x, y, depth });

describe('wrap01', () => {
  it('leaves a coordinate already in range alone', () => {
    expect(wrap01(0)).toBe(0);
    expect(wrap01(0.42)).toBe(0.42);
  });

  it('brings a star back on the opposite edge instead of clamping it there', () => {
    expect(wrap01(1.25)).toBeCloseTo(0.25);
    expect(wrap01(-0.25)).toBeCloseTo(0.75);
    expect(wrap01(3.5)).toBeCloseTo(0.5);
  });
});

describe('driftedPosition', () => {
  it('has not moved anything at the first frame', () => {
    expect(driftedPosition(star(0.3, 0.7), 0, 1400, 900)).toEqual({ x: 0.3, y: 0.7 });
  });

  it('drifts slowly enough to take minutes to cross the screen', () => {
    const width = 1400;
    const secondsToCross = width / DRIFT_PX_PER_SEC;
    expect(secondsToCross).toBeGreaterThan(120);

    // Half a crossing puts a star that started at the left edge near the middle.
    const half = driftedPosition(star(0, 0.5), (secondsToCross / 2) * 1000, width, 900);
    expect(half.x).toBeCloseTo(0.5, 2);
  });

  it('wraps a star round rather than losing it off the edge', () => {
    const width = 1400;
    const t = ((width / DRIFT_PX_PER_SEC) * 1000) * 1.25; // a crossing and a quarter
    expect(driftedPosition(star(0, 0.5), t, width, 900).x).toBeCloseTo(0.25, 2);
  });

  it('moves a near star further than a far one in the same time', () => {
    const t = 60_000;
    const near = driftedPosition(star(0.1, 0.5, 1.4), t, 1400, 900).x;
    const far = driftedPosition(star(0.1, 0.5, 0.6), t, 1400, 900).x;
    expect(near).toBeGreaterThan(far);
  });

  it('drifts upward, because the field should rise', () => {
    expect(driftedPosition(star(0.5, 0.5), 60_000, 1400, 900).y).toBeLessThan(0.5);
  });

  it('covers the same distance on screen whatever the viewport', () => {
    // Ten seconds is 50px on any width, so a phone is not left with a crawling field.
    const t = 10_000;
    const wide = driftedPosition(star(0, 0.5), t, 1400, 900).x * 1400;
    const narrow = driftedPosition(star(0, 0.5), t, 390, 900).x * 390;
    expect(wide).toBeCloseTo(narrow, 5);
    expect(wide).toBeCloseTo(DRIFT_PX_PER_SEC * 10, 5);
  });

  it('survives a zero-sized canvas instead of blanking the field with NaN', () => {
    // Happens for a frame during an orientation change on some mobile browsers.
    const at = driftedPosition(star(0.3, 0.7), 5000, 0, 0);
    expect(Number.isNaN(at.x)).toBe(false);
    expect(at).toEqual({ x: 0.3, y: 0.7 });
  });
});

describe('depthFor', () => {
  it('puts bigger stars in front', () => {
    expect(depthFor(1.7)).toBeGreaterThan(depthFor(0.4));
  });

  it('stays within the intended range even for a radius outside the seeded one', () => {
    for (const r of [-5, 0.4, 1, 1.7, 99]) {
      expect(depthFor(r)).toBeGreaterThanOrEqual(0.6);
      expect(depthFor(r)).toBeLessThanOrEqual(1.4);
    }
  });
});

describe('sway', () => {
  it('starts at rest and stays within its amplitude', () => {
    expect(sway(0, 120, 30)).toBeCloseTo(0);
    for (let t = 0; t < 300_000; t += 1000) {
      expect(Math.abs(sway(t, 120, 30))).toBeLessThanOrEqual(30);
    }
  });

  it('completes one cycle per period', () => {
    expect(sway(120_000, 120, 30)).toBeCloseTo(0, 5);
    expect(sway(30_000, 120, 30)).toBeCloseTo(30, 5);
  });

  it('does not divide by a zero period', () => {
    expect(sway(5000, 0, 30)).toBe(0);
  });
});
