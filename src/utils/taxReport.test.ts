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

describe('the detail rows reconcile', () => {
  /*
   * Realized, Fees and Net are printed side by side, and the first column meant two different things
   * depending on the row: `t.grossPnl ?? t.pnl` is gross on a synced trade and NET on a hand-entered
   * one. A trade typed in with fees filled and gross left blank — a state the trade form allows,
   * since it derives net only when both are present — printed "-400, 12, -400". Three columns that do
   * not subtract, in the file somebody forwards to an accountant.
   */
  it('has Realized minus Fees equal Net on a hand-entered row', () => {
    const typed = trade({ date: '2026-01-07', pnl: -400, fees: 12 });
    const report = buildTaxReport([typed], 2026);
    const row = report.rows[0]!;

    expect(row.realizedPnl - row.fees).toBeCloseTo(row.netPnl, 10);
    /*
     * Gross is the net with the fees added back, and the sign is worth being explicit about: the
     * trade itself lost $388, the $12 of commission took it to the $400 the trader typed in. Not
     * -$412 — that would be charging the fees twice, which is the mistake effectivePnl was fixed for
     * earlier today.
     */
    expect(row.realizedPnl).toBeCloseTo(-388, 10);
    expect(row.netPnl).toBeCloseTo(-400, 10);
  });

  it('has Realized minus Fees equal Net on a synced row', () => {
    // The population that was already right, so the fix must not disturb it.
    const synced = trade({ date: '2026-01-06', grossPnl: 300, fees: 20, pnl: 280 });
    const row = buildTaxReport([synced], 2026).rows[0]!;

    expect(row.realizedPnl).toBe(300);
    expect(row.realizedPnl - row.fees).toBeCloseTo(row.netPnl, 10);
  });

  it('reconciles down a whole mixed year', () => {
    // The actual complaint: a file where some rows subtract and some do not.
    const rows = buildTaxReport(
      [
        trade({ date: '2026-01-06', grossPnl: 300, fees: 20, pnl: 280 }),
        trade({ date: '2026-01-07', pnl: -400, fees: 12 }),
        trade({ date: '2026-01-08', pnl: 50 }),
      ],
      2026,
    ).rows;

    for (const row of rows) {
      expect(row.realizedPnl - row.fees, row.date).toBeCloseTo(row.netPnl, 10);
    }
  });

  it('keeps a multi-line note from breaking the detail rows', () => {
    /*
     * The export shares its escaper with the trade CSV now. This file's copy was the correct one, but
     * a regression in the shared helper would land here too, and this is the file where a shifted
     * column becomes a wrong number on a tax return rather than a cosmetic problem.
     */
    const csv = taxReportCsv(
      buildTaxReport([trade({ date: '2026-02-02', symbol: 'SPY\nAAPL', pnl: 10 })], 2026),
    );

    expect(csv).toContain('"SPY\nAAPL"');
  });
});

describe('what counts as the same security for a wash sale', () => {
  /*
   * The detector compared `symbol`, which for an option is the underlying ticker — so every SPY option
   * was substantially identical to every other SPY option, whatever the strike, the expiry, or whether
   * it was a call or a put.
   *
   * For a 0DTE trader, which is most of this app's users, any winner in the same underlying within a
   * month flagged any loss: it fired on 100% of losses and the CSV stamped REVIEW on every red row. A
   * flag that fires on everything is noise rather than "look at this one", which is the only thing it
   * is for.
   */
  const spyOption = (date: string, pnl: number, contract: string): Trade =>
    trade({ date, pnl, symbol: 'SPY', contract, assetType: 'option' });

  it('does not flag a different strike on the same underlying', () => {
    const report = buildTaxReport(
      [
        spyOption('2026-03-02', -400, 'SPY 02 MAR 26 660 C'),
        spyOption('2026-03-03', 500, 'SPY 03 MAR 26 640 P'),
      ],
      2026,
    );

    expect(report.potentialWashSaleCount).toBe(0);
    expect(report.rows.every((r) => !r.potentialWashSale)).toBe(true);
  });

  it('still flags the same contract re-traded inside the window', () => {
    // The case that genuinely looks like a wash, and the one the module exists for.
    const report = buildTaxReport(
      [
        spyOption('2026-03-02', -400, 'SPY 20 MAR 26 660 C'),
        spyOption('2026-03-09', 500, 'SPY 20 MAR 26 660 C'),
      ],
      2026,
    );

    expect(report.potentialWashSaleCount).toBe(1);
  });

  it('leaves a 0DTE week almost entirely unflagged', () => {
    /*
     * The owner's own pattern: one winner and one loser a day on different strikes. This reported ten
     * matches out of ten losses before the fix.
     */
    const week: Trade[] = [];
    for (let day = 1; day <= 10; day++) {
      const date = `2026-03-${String(day).padStart(2, '0')}`;
      week.push(spyOption(date, 300, `SPY ${day} MAR 26 ${660 + day} C`));
      week.push(spyOption(date, -250, `SPY ${day} MAR 26 ${640 + day} P`));
    }

    expect(buildTaxReport(week, 2026).potentialWashSaleCount).toBe(0);
  });

  it('still matches a stock by its ticker', () => {
    // mapSnapTradeActivities sets contract to the underlying for equities, so the key is unchanged
    // there — but a hand-entered stock trade has no contract at all and must still match.
    const report = buildTaxReport(
      [
        trade({ date: '2026-03-02', symbol: 'AAPL', pnl: -400 }),
        trade({ date: '2026-03-05', symbol: 'AAPL', pnl: 500 }),
      ],
      2026,
    );

    expect(report.potentialWashSaleCount).toBe(1);
  });
});
