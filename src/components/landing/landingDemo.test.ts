import { describe, expect, it } from 'vitest';
import {
  demoInsights,
  demoJournal,
  HEAVY_DAY,
  LIGHT_DAY,
  monthStats,
  sampleMonth,
  SYNC_DAYS,
  visibleDays,
} from './landingDemo';
import { curvePoints, demoResult } from './simulatorDemo';
import { easeOutCubic, tweenValue } from '../../hooks/useCountUp';

/*
 * The landing page's sample data. It is shown to every visitor with "sample journal" beside it, so
 * the arithmetic has to be right and the story it tells has to be honest — a cap that only ever
 * helps would be an advert, not a demo.
 */

describe('sampleMonth', () => {
  // September 2026 starts on a Tuesday and has 30 days.
  const sept = sampleMonth(2026, 8);

  it('lays out a real month, Sunday first', () => {
    expect(sept.leading).toBe(2);
    expect(sept.days).toHaveLength(30);
  });

  it('trades on weekdays only', () => {
    const weekend = sept.days.filter((d) => [0, 6].includes((sept.leading + d.day - 1) % 7));
    expect(weekend.every((d) => d.pnl === null)).toBe(true);
    expect(sept.days.filter((d) => d.pnl !== null)).toHaveLength(22);
  });

  it('holds back the last trading days for the sync', () => {
    expect(sept.syncDays).toEqual([28, 29, 30]);
    expect(sept.syncDays).toHaveLength(SYNC_DAYS);
    const before = visibleDays(sept, 0);
    expect(before.filter((d) => sept.syncDays.includes(d.day)).every((d) => d.pnl === null)).toBe(true);
    expect(visibleDays(sept, SYNC_DAYS)).toEqual(sept.days);
  });

  it('is the same every time', () => {
    expect(sampleMonth(2026, 8)).toEqual(sept);
  });
});

describe('monthStats', () => {
  const day = (pnl: number | null, n: number) => ({ day: n, pnl, trades: pnl === null ? 0 : 1 });

  it('adds up what the chips say', () => {
    const s = monthStats([day(100, 1), day(-50, 2), day(null, 3), day(30, 4), day(20, 5)]);
    expect(s.net).toBe(100);
    expect(s.winRate).toBe(75);
    expect(s.avgPerDay).toBe(25);
    expect(s.profitFactor).toBe(3);
    // Green days in a row from the last traded day backwards; the empty day does not break it.
    expect(s.streak).toBe(2);
  });

  it('is all zeros with nothing traded', () => {
    expect(monthStats([day(null, 1)])).toEqual({ net: 0, winRate: 0, avgPerDay: 0, profitFactor: 0, streak: 0 });
  });

  it('moves when the sync lands, which is the point of the animation', () => {
    const sept = sampleMonth(2026, 8);
    expect(monthStats(visibleDays(sept, SYNC_DAYS)).net).not.toBe(monthStats(visibleDays(sept, 0)).net);
  });
});

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

  it('shows a cap helping, and a cap that is too tight helping less', () => {
    const none = demoResult(trades, null);
    const four = demoResult(trades, 4);
    const one = demoResult(trades, 1);
    expect(none.difference).toBe(0);
    expect(none.actual).toBeLessThan(0);
    expect(four.difference).toBeGreaterThan(0);
    // Honest about the trade-off: a cap of one throws away winners the cap of four keeps.
    expect(one.simulated).toBeLessThan(four.simulated);
  });

  it('draws curves that end where the totals do', () => {
    const r = demoResult(trades, 5);
    expect(r.actualCurve).toHaveLength(30);
    expect(r.actualCurve.at(-1)).toBeCloseTo(r.actual, 2);
    expect(r.simulatedCurve.at(-1)).toBeCloseTo(r.simulated, 2);
  });
});

describe('demoInsights', () => {
  const trades = demoJournal();
  const d = demoInsights(trades);

  it('splits every trade between the first four and the rest', () => {
    const total = trades.reduce((s, t) => s + t.pnl, 0);
    expect(d.firstFourPnl + d.afterFourthPnl).toBeCloseTo(total, 1);
  });

  it('agrees with the simulator: the first four are exactly what a cap of four keeps', () => {
    expect(d.firstFourPnl).toBeCloseTo(demoResult(trades, 4).simulated, 1);
  });

  it('counts heavy and light days by their thresholds', () => {
    const counts = new Map<string, number>();
    for (const t of trades) counts.set(t.date, (counts.get(t.date) ?? 0) + 1);
    expect(d.heavyDays).toBe([...counts.values()].filter((n) => n >= HEAVY_DAY).length);
    expect(d.lightDays).toBe([...counts.values()].filter((n) => n <= LIGHT_DAY).length);
  });
});

describe('curvePoints', () => {
  it('puts every series in one space, with zero inside it', () => {
    const { lines, zeroY } = curvePoints([[0, 50, 100], [0, -50, -100]], 600, 200);
    expect(lines).toHaveLength(2);
    expect(lines[0].split(' ')).toHaveLength(3);
    expect(zeroY).toBeGreaterThan(0);
    expect(zeroY).toBeLessThan(200);
    // The top of the first line is above zero, the bottom of the second below it.
    expect(Number(lines[0].split(' ')[2].split(',')[1])).toBeLessThan(zeroY);
    expect(Number(lines[1].split(' ')[2].split(',')[1])).toBeGreaterThan(zeroY);
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
