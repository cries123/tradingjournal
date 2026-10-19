import { describe, expect, it } from 'vitest';
import { demoInsights, demoJournal, HEAVY_DAY, LIGHT_DAY } from './landingDemo';
import { easeOutCubic, tweenValue } from '../../hooks/useCountUp';

/*
 * The landing page's sample journal. It is shown to every visitor with "sample journal" beside it,
 * so the arithmetic has to be right. What the page tells with it is tested in landingStory.test.ts.
 */

describe('the sample journal', () => {
  const trades = demoJournal();

  it('is thirty weekdays, in order within each day', () => {
    const dates = [...new Set(trades.map((t) => t.date))];
    expect(dates).toHaveLength(30);
    expect(dates.every((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))).toBe(true);
    const ids = trades.map((t) => t.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('is identical on every load', () => {
    expect(demoJournal()).toEqual(trades);
  });
});

describe('demoInsights', () => {
  const trades = demoJournal();
  const d = demoInsights(trades);

  it('splits every trade between the first four and the rest', () => {
    const total = trades.reduce((s, t) => s + t.pnl, 0);
    expect(d.firstFourPnl + d.afterFourthPnl).toBeCloseTo(total, 1);
  });

  it('counts heavy and light days by their thresholds', () => {
    const counts = new Map<string, number>();
    for (const t of trades) counts.set(t.date, (counts.get(t.date) ?? 0) + 1);
    expect(d.heavyDays).toBe([...counts.values()].filter((n) => n >= HEAVY_DAY).length);
    expect(d.lightDays).toBe([...counts.values()].filter((n) => n <= LIGHT_DAY).length);
  });
});

describe('count-up easing', () => {
  it('starts at the start, ends at the end, and never overshoots', () => {
    expect(tweenValue(100, 200, 0)).toBe(100);
    expect(tweenValue(100, 200, 1)).toBe(200);
    expect(tweenValue(100, 200, 2)).toBe(200);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
