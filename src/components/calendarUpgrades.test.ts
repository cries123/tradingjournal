import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DailySummary, Trade } from '../types';
import { monthHasTrades, previousMonth, weekShares, aggregateTradesByDay, buildCalendarWeeks } from '../utils/calendar';

/*
 * The calendar's second pass: rule-break marks on the days, the week's figure as a figure with a
 * bar, last month beside this month's total, and a list instead of a grid on a phone.
 */

vi.mock('../context/useSettings', () => ({
  useSettings: () => ({
    settings: { currency: 'USD' },
    viewingAllJournals: false,
  }),
}));

const { DashboardDayCell } = await import('./DashboardDayCell');
const { DashboardWeekTotalCell } = await import('./DashboardWeekTotalCell');
const { DashboardCalendarList } = await import('./DashboardCalendarList');

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const paint = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replaceAll('<!-- -->', '');

const trade = (date: string, pnl: number): Trade => ({ id: `${date}-${pnl}`, date, symbol: 'SPY', pnl }) as Trade;
const summary = (over: Partial<DailySummary> = {}): DailySummary => ({
  date: '2026-10-06',
  totalPnl: -742,
  tradeCount: 2,
  tags: [],
  trades: [trade('2026-10-06', -500), trade('2026-10-06', -242)],
  ...over,
});

describe('a day that broke a rule', () => {
  it('carries the amber mark, and a day that kept them does not', () => {
    const broke = paint(createElement(DashboardDayCell, { dayNumber: 6, summary: summary(), ruleBroken: true }));
    const kept = paint(createElement(DashboardDayCell, { dayNumber: 6, summary: summary() }));
    expect(broke).toContain('Broke one of your rules');
    expect(broke).toContain('text-amber-300');
    expect(kept).not.toContain('Broke one of your rules');
  });

  it('keeps the mark off a collapsed row, where there is no room for it', () => {
    const html = paint(createElement(DashboardDayCell, { dayNumber: 6, summary: summary(), ruleBroken: true, compact: true }));
    expect(html).not.toContain('Broke one of your rules');
  });
});

describe('the week total', () => {
  it('is drawn as the figure with a bar, not a labelled tint', () => {
    const html = paint(createElement(DashboardWeekTotalCell, { summary: { weekIndex: 0, totalPnl: -935, tradeCount: 5 }, share: 0.5 }));
    expect(text(html)).toContain('-$935.00');
    expect(html).not.toContain('Week total');
    expect(html).toContain('width:50%');
    expect(html).toContain('bg-loss-bright');
  });

  it('gives even the smallest week a visible sliver of bar', () => {
    const html = paint(createElement(DashboardWeekTotalCell, { summary: { weekIndex: 0, totalPnl: 12, tradeCount: 1 }, share: 0.01 }));
    expect(html).toContain('width:8%');
  });

  it('sizes weeks against the month’s biggest, by how much happened rather than which way', () => {
    const shares = weekShares([
      { summary: { weekIndex: 0, totalPnl: 316, tradeCount: 3 } },
      { summary: { weekIndex: 1, totalPnl: -935, tradeCount: 5 } },
      { summary: { weekIndex: 2, totalPnl: 0, tradeCount: 0 } },
    ]);
    expect(shares[1]).toBe(1);
    expect(shares[0]).toBeCloseTo(316 / 935);
    expect(shares[2]).toBe(0);
  });
});

describe('last month beside this one', () => {
  it('knows which month came before, across the year boundary', () => {
    expect(previousMonth(2026, 0)).toEqual({ year: 2025, month: 11 });
    expect(previousMonth(2026, 9)).toEqual({ year: 2026, month: 8 });
  });

  it('only compares against a month that had trades', () => {
    const summaries = aggregateTradesByDay([trade('2026-10-06', -742), trade('2026-09-12', 300)]);
    expect(monthHasTrades(summaries, 2026, 8)).toBe(true);
    expect(monthHasTrades(summaries, 2026, 7)).toBe(false);
  });
});

describe('the phone list', () => {
  const trades = [trade('2026-10-01', 184), trade('2026-10-01', 90), trade('2026-10-06', -742), trade('2026-10-09', 175)];
  const summaries = aggregateTradesByDay(trades);
  const weeks = buildCalendarWeeks(2026, 9, summaries);
  const dayKey = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const render = (over: Partial<Parameters<typeof DashboardCalendarList>[0]> = {}) =>
    paint(
      createElement(DashboardCalendarList, {
        weeks,
        year: 2026,
        month: 9,
        today: null,
        fresh: new Set<string>(),
        ruleDates: new Set<string>(),
        shares: weekShares(weeks),
        dayKey,
        onDayClick: () => undefined,
        ...over,
      }),
    );

  it('lists the days that were traded, with the day’s figure, count and split, and nothing else', () => {
    const words = text(render());
    expect(words).toContain('Thu 1');
    expect(words).toContain('$274.00');
    expect(words).toContain('2 trades · 2W 0L');
    expect(words).toContain('Tue 6');
    expect(words).toContain('-$742.00');
    // A day with no trades is not a row.
    expect(words).not.toContain('Fri 2');
    expect(words).not.toContain('Mon 5');
  });

  it('shows today even when it is empty, as the one tap worth offering', () => {
    const words = text(render({ today: new Date(2026, 9, 20) }));
    expect(words).toContain('Tue 20');
    expect(words).toContain('Today — log a trade');
  });

  it('marks a rule break on the row', () => {
    expect(text(render({ ruleDates: new Set(['2026-10-06']) }))).toContain('Rule');
    expect(text(render())).not.toContain(' Rule ');
  });

  it('heads each week with its range and its figure', () => {
    const words = text(render());
    expect(words).toContain('Sun 4 – Sat 10');
    expect(words).toContain('-$567.00');
  });

  it('says so when the month is empty', () => {
    const html = paint(
      createElement(DashboardCalendarList, {
        weeks: buildCalendarWeeks(2026, 9, new Map()),
        year: 2026,
        month: 9,
        today: null,
        fresh: new Set<string>(),
        ruleDates: new Set<string>(),
        shares: [],
        dayKey,
        onDayClick: () => undefined,
      }),
    );
    expect(text(html)).toContain('No trades this month yet.');
  });
});
