import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DailySummary, Trade } from '../types';
import { monthHasTrades, previousMonth, weekShares, aggregateTradesByDay } from '../utils/calendar';

/*
 * The calendar's second pass: rule-break marks on the days, the week's figure as a figure with a
 * bar, and last month beside this month's total.
 */

vi.mock('../context/useSettings', () => ({
  useSettings: () => ({
    settings: { currency: 'USD' },
    viewingAllJournals: false,
  }),
}));

const { DashboardDayCell } = await import('./DashboardDayCell');
const { DashboardWeekTotalCell } = await import('./DashboardWeekTotalCell');

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
