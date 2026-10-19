import { describe, expect, it } from 'vitest';
import type { Trade } from '../../types';
import { demoJournal } from './landingDemo';
import { ordinal, signedMoney, STORY_CAP, storyDay, storyMonth, wholeMoney } from './landingStory';

/*
 * The landing page's one sample month. The figures are pinned because the page prints them in prose
 * ("three trades in, +$152.09"); if the sample ever changes, these fail before the copy goes stale.
 */

describe('the sample month', () => {
  const june = storyMonth();

  it('adds up to the figures the page prints', () => {
    expect(june.label).toBe('June 2026');
    expect(june.net).toBe(-1823.64);
    // The same two figures the app's Performance screen prints for this sample: "Stop after three.
    // The trades before your fourth made +$2,413.25" and "your 4th and later trades … -$4,236.89".
    expect(june.cappedNet).toBe(2413.25);
    expect(june.pastCapCost).toBe(-4236.89);
    expect(june.net).toBeCloseTo(june.cappedNet + june.pastCapCost, 2);
  });

  it('is laid out like the app’s calendar: Sunday first, every day of the month', () => {
    // June 1, 2026 is a Monday.
    expect(june.leading).toBe(1);
    expect(june.days).toHaveLength(30);
    expect(june.days.filter((d) => d.pnl !== null)).toHaveLength(22);
    expect(june.greenDays + june.redDays).toBe(22);
  });

  it('marks exactly the days that went past the cap', () => {
    const marked = june.days.filter((d) => d.brokeCap);
    expect(marked.every((d) => d.trades > STORY_CAP)).toBe(true);
    expect(june.days.filter((d) => !d.brokeCap).every((d) => d.trades <= STORY_CAP)).toBe(true);
    expect(june.capDays).toBe(marked.length);
  });

  it('caps each day at its first three trades, in the order they were taken', () => {
    const days = new Map<string, Trade[]>();
    for (const t of demoJournal().filter((t) => t.date.startsWith('2026-06'))) days.set(t.date, [...(days.get(t.date) ?? []), t]);
    let kept = 0;
    for (const list of days.values()) {
      kept += [...list].sort((a, b) => a.id.localeCompare(b.id)).slice(0, STORY_CAP).reduce((s, t) => s + t.pnl, 0);
    }
    expect(june.cappedNet).toBeCloseTo(kept, 2);
    expect(STORY_CAP).toBe(3);
  });

  it('shows an empty month as empty rather than dividing by nothing', () => {
    const empty = storyMonth([], '2026-06');
    expect(empty.net).toBe(0);
    expect(empty.days.every((d) => d.pnl === null && !d.brokeCap)).toBe(true);
  });
});

describe('the day played back', () => {
  const day = storyDay();

  it('is June 26: three winners, then five losers past the cap', () => {
    expect(day.label).toBe('Friday, June 26');
    expect(day.trades.map((t) => t.running)).toEqual([114.78, 124.21, 152.09, 120.3, -41.86, -202.58, -349.8, -487.77]);
    expect(day.trades.slice(0, STORY_CAP).every((t) => t.pnl > 0)).toBe(true);
    // The story says so in words: "two losers", then "none of them wins back".
    expect(day.trades.slice(STORY_CAP).every((t) => t.pnl < 0)).toBe(true);
    expect(day.atCap).toBe(152.09);
    expect(day.total).toBe(-487.77);
    expect(day.afterCap).toBe(-639.86);
  });

  it('flags every trade after the cap and none before it', () => {
    expect(day.trades.map((t) => t.pastCap)).toEqual([false, false, false, true, true, true, true, true]);
  });

  it('keeps the trades in the order they were taken, whatever order they arrive in', () => {
    const shuffled = [...demoJournal()].reverse();
    expect(storyDay(shuffled).trades.map((t) => t.pnl)).toEqual(day.trades.map((t) => t.pnl));
  });

  it('copes with a day shorter than the cap and a day with no trades', () => {
    const t = (id: string, pnl: number): Trade => ({ id, date: '2026-06-01', symbol: 'SPY', pnl });
    const short = storyDay([t('a', 10), t('b', -4)], '2026-06-01');
    expect(short.atCap).toBe(6);
    expect(short.afterCap).toBe(0);
    expect(storyDay([], '2026-06-01')).toMatchObject({ trades: [], total: 0, atCap: 0, afterCap: 0 });
  });
});

describe('money and places', () => {
  it('writes money the way the app does', () => {
    expect(signedMoney(-487.77)).toBe('-$487.77');
    expect(signedMoney(2785.32)).toBe('+$2,785.32');
    expect(wholeMoney(-600.88)).toBe('-$601');
    expect(wholeMoney(109.7)).toBe('$110');
  });

  it('names a trade’s place in its day', () => {
    expect([1, 2, 3, 4, 8, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '8th', '11th', '12th', '13th', '21st', '22nd']);
  });
});
