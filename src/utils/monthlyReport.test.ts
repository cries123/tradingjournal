import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { buildMonthlyReport, REPORT_MAX_SYMBOLS } from './monthlyReport';
import { computeStats, getMonthTrades } from './stats';
import { MonthlyReportDocument } from '../components/report/MonthlyReportDocument';

let n = 0;
const trade = (date: string, pnl: number, over: Partial<Trade> = {}): Trade =>
  ({ id: `t${n++}`, date, symbol: 'SPY', side: 'long', pnl, ...over }) as Trade;

const JULY = [
  trade('2026-07-06', 120, { assetType: 'option', optionType: 'call', fees: 1.3 }),
  trade('2026-07-06', -40, { assetType: 'option', optionType: 'put', fees: 1.3 }),
  trade('2026-07-07', -300, { assetType: 'option', optionType: 'put', symbol: 'QQQ', fees: 2.6 }),
  trade('2026-07-14', 75, { assetType: 'option', optionType: 'call', fees: 1.3 }),
  // A different month, which must not leak in.
  trade('2026-08-03', 999),
];

const report = (over: Partial<Parameters<typeof buildMonthlyReport>[0]> = {}) =>
  buildMonthlyReport({ trades: JULY, year: 2026, month: 6, scope: 'Schwab', ...over });

describe('buildMonthlyReport', () => {
  it('reports the month with the same figures the dashboard computes', () => {
    const r = report();
    expect(r.label).toBe('July 2026');
    expect(r.stats).toEqual(computeStats(getMonthTrades(JULY, 2026, 6)));
    expect(r.stats.netPnl).toBe(-145);
    expect(r.fees).toBeCloseTo(6.5, 6);
  });

  it('lays the calendar out with day and week totals that add up to the month', () => {
    const r = report();
    const days = r.weeks.flatMap((w) => w.days).filter((d) => d.day !== null);
    expect(days).toHaveLength(31);
    expect(days.find((d) => d.day === 6)).toMatchObject({ pnl: 80, trades: 2 });
    expect(days.find((d) => d.day === 8)).toMatchObject({ pnl: null, trades: 0 });
    expect(r.weeks.reduce((sum, w) => sum + w.pnl, 0)).toBe(r.stats.netPnl);
  });

  it('ranks symbols by what they made, best first', () => {
    expect(report().symbols.map((s) => s.symbol)).toEqual(['SPY', 'QQQ']);
  });

  it('caps the symbol table for a journal that trades dozens of tickers', () => {
    const many = Array.from({ length: 25 }, (_, i) => trade('2026-07-06', i, { symbol: `T${i}` }));
    expect(buildMonthlyReport({ trades: many, year: 2026, month: 6, scope: 'x' }).symbols).toHaveLength(REPORT_MAX_SYMBOLS);
  });

  it('lists only the weekdays that were traded', () => {
    // Jul 6 and 7 are Mon and Tue, Jul 14 is a Tue.
    expect(report().weekdays).toEqual([
      { label: 'Mon', days: 1, pnl: 80 },
      { label: 'Tue', days: 2, pnl: -225 },
    ]);
  });

  it('splits direction the way the dashboard does', () => {
    expect(report().direction.title).toBe('Calls vs Puts');
  });

  it('checks the trader’s rules for one journal, and not with every journal added together', () => {
    const rules = { enabled: true, maxDailyLoss: 200 };
    expect(report({ rules }).violations).toHaveLength(1);
    expect(report({ rules, allJournals: true }).violations).toBeNull();
    expect(report({ rules: { enabled: false } }).violations).toBeNull();
  });

  it('says so plainly for a month with no trades', () => {
    expect(report({ month: 5 }).hasTrades).toBe(false);
  });
});

describe('the report document', () => {
  const html = renderToString(
    createElement(MonthlyReportDocument, { report: report(), username: 'temp', generatedOn: 'Oct 11, 2026' }),
  ).replace(/<!-- -->/g, '');

  it('prints the month, the journal and the handle — never a real name', () => {
    expect(html).toContain('July 2026');
    expect(html).toContain('Schwab');
    expect(html).toContain('@temp');
  });

  it('shows the net figure and no broken arithmetic', () => {
    expect(html).toContain('-$145.00');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('printing', () => {
  const css = readFileSync('src/index.css', 'utf8');

  it('hides the printed copy on screen and shows only it on paper', () => {
    expect(css).toMatch(/\.report-print \{\s*display: none;/);
    const print = css.slice(css.indexOf('@media print {'));
    expect(print).toMatch(/body > \*:not\(\.report-print\) \{\s*display: none !important;/);
    expect(print).toMatch(/\.report-print \{\s*display: block;/);
  });

  it('renders the printed copy outside the app, straight into the page body', () => {
    const view = readFileSync('src/components/report/MonthlyReportView.tsx', 'utf8');
    expect(view).toContain("createPortal(<div className=\"report-print\">{document_}</div>, document.body)");
  });
});
