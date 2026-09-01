import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { availableTaxYears, buildTaxReport, taxReportCsv } from './taxReport';

let seq = 0;
function trade(over: Partial<Trade> = {}): Trade {
  seq += 1;
  return { id: `t${seq}`, date: '2026-03-04', symbol: 'AAPL', pnl: 100, ...over };
}

describe('availableTaxYears', () => {
  it('lists the years actually traded, newest first', () => {
    const trades = [
      trade({ date: '2024-06-01' }),
      trade({ date: '2026-01-02' }),
      trade({ date: '2025-11-30' }),
      trade({ date: '2026-12-31' }),
    ];
    expect(availableTaxYears(trades)).toEqual([2026, 2025, 2024]);
  });

  it('ignores rows with an unusable date', () => {
    expect(availableTaxYears([trade({ date: '' }), trade({ date: '2026-02-02' })])).toEqual([2026]);
  });
});

describe('buildTaxReport', () => {
  it('includes only the requested year — the bug the old export shipped with', () => {
    const trades = [
      trade({ date: '2025-12-31', pnl: 5000 }),
      trade({ date: '2026-01-02', pnl: 100 }),
      trade({ date: '2026-07-15', pnl: -40 }),
      trade({ date: '2027-01-01', pnl: 9999 }),
    ];
    const report = buildTaxReport(trades, 2026);

    expect(report.tradeCount).toBe(2);
    expect(report.netPnl).toBe(60);
    expect(report.rows.every((r) => r.date.startsWith('2026'))).toBe(true);
  });

  it('separates gains from losses and nets them', () => {
    const trades = [
      trade({ date: '2026-02-01', pnl: 300 }),
      trade({ date: '2026-02-02', pnl: 200 }),
      trade({ date: '2026-02-03', pnl: -450 }),
    ];
    const report = buildTaxReport(trades, 2026);

    expect(report.grossGains).toBe(500);
    expect(report.grossLosses).toBe(-450);
    expect(report.netPnl).toBe(50);
  });

  it('nets fees into P&L once, and reports the fee total separately', () => {
    const trades = [trade({ date: '2026-02-01', grossPnl: 300, fees: 20 })];
    const report = buildTaxReport(trades, 2026);

    expect(report.rows[0].realizedPnl).toBe(300);
    expect(report.rows[0].netPnl).toBe(280);
    expect(report.netPnl).toBe(280);
    expect(report.fees).toBe(20);
  });

  it('flags a December loss replaced in January, which a year-scoped scan would miss', () => {
    const trades = [
      trade({ date: '2026-12-20', symbol: 'TSLA', pnl: -800 }),
      trade({ date: '2027-01-05', symbol: 'TSLA', pnl: 400 }),
    ];
    const report = buildTaxReport(trades, 2026);

    expect(report.tradeCount).toBe(1);
    expect(report.potentialWashSaleCount).toBe(1);
    expect(report.rows[0].replacementDate).toBe('2027-01-05');
  });

  it('does not flag a repurchase outside the 30-day window', () => {
    const trades = [
      trade({ date: '2026-01-05', symbol: 'TSLA', pnl: -800 }),
      trade({ date: '2026-06-05', symbol: 'TSLA', pnl: 400 }),
    ];
    expect(buildTaxReport(trades, 2026).potentialWashSaleCount).toBe(0);
  });

  it('rolls up by symbol, biggest net first', () => {
    const trades = [
      trade({ date: '2026-02-01', symbol: 'NVDA', pnl: 900 }),
      trade({ date: '2026-02-02', symbol: 'AAPL', pnl: 100 }),
      trade({ date: '2026-02-03', symbol: 'AAPL', pnl: -600 }),
    ];
    const report = buildTaxReport(trades, 2026);

    expect(report.symbols.map((s) => s.symbol)).toEqual(['NVDA', 'AAPL']);
    const aapl = report.symbols.find((s) => s.symbol === 'AAPL')!;
    expect(aapl.gains).toBe(100);
    expect(aapl.losses).toBe(-600);
    expect(aapl.net).toBe(-500);
  });

  it('returns an empty but valid report for a year with no trades', () => {
    const report = buildTaxReport([trade({ date: '2026-02-01' })], 2020);
    expect(report.tradeCount).toBe(0);
    expect(report.netPnl).toBe(0);
    expect(report.symbols).toEqual([]);
  });
});

describe('taxReportCsv', () => {
  const report = buildTaxReport(
    [
      trade({ date: '2026-02-01', symbol: 'AAPL', grossPnl: 300, fees: 20 }),
      trade({ date: '2026-03-01', symbol: 'MSFT', pnl: -150 }),
    ],
    2026,
  );
  const csv = taxReportCsv(report);

  it('leads with the year and the totals', () => {
    expect(csv.split('\n')[0]).toContain('2026');
    expect(csv).toContain('Net realized P&L,130.00');
    expect(csv).toContain('Trades closed,2');
  });

  it('carries the detail rows under their own header', () => {
    expect(csv).toContain('Date,Symbol,Realized P&L,Fees,Net P&L');
    expect(csv).toContain('2026-02-01,AAPL,300.00,20.00,280.00');
  });

  it('never calls a flagged loss disallowed', () => {
    expect(csv).toMatch(/flagged for review only/i);
    expect(csv.toLowerCase()).not.toContain('disallowed loss,');
  });

  it('quotes a symbol containing a comma rather than breaking the row', () => {
    const odd = taxReportCsv(buildTaxReport([trade({ date: '2026-02-01', symbol: 'A,B' })], 2026));
    expect(odd).toContain('"A,B"');
  });
});
