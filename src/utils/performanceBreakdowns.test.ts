import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { formatCurrency } from './format';
import { brokerCoverage } from './brokerAnalytics';
import { panelImpact } from './performanceVerdict';
import {
  breakdownTsv,
  breakdownsCsv,
  buildBreakdowns,
  findEntry,
  tiltLead,
  type Breakdown,
} from './performanceBreakdowns';
import { partsText } from './performanceScreen';
import { simulateRules } from './ruleSimulator';

const fmt = (n: number) => formatCurrency(n, 'USD');
const period = { noun: '2026', during: 'in 2026' };

let n = 0;
const trade = (over: Partial<Trade>): Trade =>
  ({ id: `snaptrade_acc_${String(n++).padStart(5, '0')}`, date: '2026-08-03', symbol: 'SPY', pnl: 0, assetType: 'option', optionType: 'call', quantity: 2, tradePrice: 2, fees: 1, ...over }) as Trade;

/** SPY 0DTE that bleeds after the third trade of the day, and CVX shares that win. */
function bleedsLate(): Trade[] {
  n = 0;
  const trades: Trade[] = [];
  for (let day = 1; day <= 12; day++) {
    const date = `2026-08-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < 7; i++) {
      const pnl = i >= 3 ? (i % 2 === 0 ? -120 : -60) : i === 1 ? -20 : 45;
      trades.push(trade({ date, openDate: date, expiration: date, pnl, grossPnl: pnl + 1, optionType: i % 3 === 0 ? 'put' : 'call' }));
    }
  }
  for (let day = 13; day <= 16; day++) {
    const date = `2026-08-${day}`;
    trades.push(trade({ date, openDate: date, symbol: 'CVX', assetType: 'stock', expiration: undefined, pnl: 300, grossPnl: 300.65, fees: 0.65, quantity: 50, tradePrice: 150 }));
  }
  return trades;
}

const get = (list: Breakdown[], key: Breakdown['key']) => list.find((b) => b.key === key)!;

describe('the breakdown list', () => {
  it('is ranked by money, biggest first, with ties kept in the documented order', () => {
    const { list } = buildBreakdowns(bleedsLate(), fmt, period);
    expect(list.map((b) => b.key)).toEqual(['sequence', 'symbols', 'load', 'instruments', 'tilt', 'sizing', 'cost']);
    // Symbols and day size both come to $3,480 here; the documented order breaks the tie.
    expect(get(list, 'symbols').impact).toBe(get(list, 'load').impact);
  });

  it('ranks each broker breakdown by the same panelImpact the cards were ranked by', () => {
    const trades = bleedsLate();
    const coverage = brokerCoverage(trades);
    const { list } = buildBreakdowns(trades, fmt, period, coverage);
    for (const key of ['sequence', 'load', 'instruments', 'sizing', 'cost'] as const) {
      expect(get(list, key).impact).toBe(panelImpact(coverage, key, 0));
    }
  });

  it('does not rank a tilt that pays as if it were money: a better trade after a loss ranks last', () => {
    n = 0;
    const trades: Trade[] = [];
    // Every day: a loss, then a big win; a win, then a small loss. The trade after a loss is the good one.
    for (let day = 1; day <= 10; day++) {
      const date = `2026-03-${String(day).padStart(2, '0')}`;
      for (const pnl of [-30, 200, 50, -10]) trades.push(trade({ date, pnl }));
    }
    const coverage = brokerCoverage(trades);
    expect(coverage.tilt!.delta).toBeGreaterThan(0);
    const { list } = buildBreakdowns(trades, fmt, period, coverage);
    const tilt = get(list, 'tilt');
    expect(tilt.impact).toBe(0);
    expect(tilt.figure.text.startsWith('+')).toBe(true);
    expect(list.at(-1)!.impact).toBe(0);
    expect(list.indexOf(tilt)).toBeGreaterThan(list.indexOf(get(list, 'sequence')));
  });

  it('shows nothing it has not got the sample for', () => {
    const four = [trade({ pnl: 10 }), trade({ pnl: -5 }), trade({ pnl: 20 }), trade({ pnl: -8 })];
    const set = buildBreakdowns(four, fmt, period);
    expect(set.list.filter((b) => b.key !== 'symbols')).toEqual([]);
    expect(set.edge).toBeNull();
    // What is missing is still named, so the screen says what to record rather than nothing.
    expect(set.missing.map((m) => m.key)).toEqual(['setups', 'hourly', 'expectancy', 'discipline', 'excursions']);
  });

  it('keeps every ticker that clears the gate, not the eight the old card kept', () => {
    n = 0;
    const trades: Trade[] = [];
    // Ten tickers, sorted by money the worst is tenth — the one an eight-row cut would drop.
    for (let s = 0; s < 10; s++) {
      for (let i = 0; i < 3; i++) trades.push(trade({ symbol: `T${s}`, date: `2026-02-${String(i + 1).padStart(2, '0')}`, pnl: s === 9 ? -900 : 50 + s }));
    }
    const symbols = get(buildBreakdowns(trades, fmt, period).list, 'symbols');
    expect(symbols.table!.rows).toHaveLength(10);
    expect(symbols.table!.rows.find((r) => r.highlight)!.label).toBe('T9');
    expect(symbols.figure.text).toBe('-$2,700');
  });
});

describe('a breakdown', () => {
  it('leads with what cost the most and what earns the most per trade', () => {
    const seq = get(buildBreakdowns(bleedsLate(), fmt, period).list, 'sequence');
    expect(partsText(seq.lead)).toBe('Your 4th and later trades cost you $4,320.00 across 48 trades. Your 1st trade is the best one at $108.75 a trade.');
    expect(partsText(seq.phoneLead)).toBe('Your 4th and later trades cost you $4,320.00. Your 1st trade is the best at $108.75 a trade.');
    // The figures are marked, so the screen colors them.
    expect(seq.lead).toContainEqual({ text: '4th and later', tone: 'loss' });
    expect(seq.lead).toContainEqual({ text: '$108.75', tone: 'profit' });
  });

  it('names the best row by what it earns a trade, not by its total, which mostly counts how many there were', () => {
    n = 0;
    const trades: Trade[] = [];
    // Ten days of a small first trade and a losing second; three of them add a big third.
    for (let d = 1; d <= 10; d++) {
      const date = `2026-04-${String(d).padStart(2, '0')}`;
      for (const pnl of d <= 3 ? [20, -5, 40] : [20, -5]) trades.push(trade({ date, pnl }));
    }
    const seq = get(buildBreakdowns(trades, fmt, period).list, 'sequence');
    // The 1st row made more in total ($200 against $120), the 3rd more a trade ($40 against $20).
    expect(partsText(seq.lead)).toBe('Your 2nd trade cost you $50.00 across 10 trades. Your 3rd trade is the best one at $40.00 a trade.');
  });

  it('tints the row the lead is about, and totals the rest as "All trades" only when that is what they are', () => {
    const seq = get(buildBreakdowns(bleedsLate(), fmt, period).list, 'sequence');
    expect(seq.table!.rows.filter((r) => r.highlight).map((r) => r.short)).toEqual(['4th+']);
    expect(seq.table!.total).toMatchObject({ label: 'All trades', count: 88, net: -2280 });

    // Only two days reach a fourth trade: that row is gated out, so the rows no longer cover everything.
    n = 0;
    const thin: Trade[] = [];
    for (let d = 1; d <= 7; d++) {
      const date = `2026-01-${String(d).padStart(2, '0')}`;
      for (const pnl of d <= 2 ? [40, -25, 15, -60] : [40, -25, 15]) thin.push(trade({ date, pnl }));
    }
    const partial = get(buildBreakdowns(thin, fmt, period).list, 'sequence');
    expect(partial.table!.rows.map((r) => r.short)).toEqual(['1st', '2nd', '3rd']);
    expect(partial.table!.total).toMatchObject({ label: 'Total', count: 21 });
  });

  it('offers the cap the rule simulator would test, with its figure, only when the cap would have helped', () => {
    const trades = bleedsLate();
    const seq = get(buildBreakdowns(trades, fmt, period).list, 'sequence');
    const sim = simulateRules(trades, { enabled: true, maxTradesPerDay: 3 });
    expect(seq.cap).toEqual({ cap: 3, simulated: sim.simulatedPnl, actual: sim.actualPnl });

    // The same days with the late trades winning: a cap would have cost money, so it is not offered.
    const lateWins = trades.map((t) => (t.pnl === -120 || t.pnl === -60 ? { ...t, pnl: -t.pnl, grossPnl: -t.pnl + 1 } : t));
    const after = get(buildBreakdowns(lateWins, fmt, period).list, 'sequence');
    expect(after.cap).toBeNull();
  });

  it('counts whole days for the day-size breakdown, with green days for its rate', () => {
    const load = get(buildBreakdowns(bleedsLate(), fmt, period).list, 'load');
    expect(load.table!.unit).toBe('day');
    expect(load.table!.winLabel).toBe('Green %');
    expect(load.table!.rows.map((r) => [r.label, r.count, r.net])).toEqual([
      ['1–2 trades', 4, 1200],
      ['6–10 trades', 12, -3480],
    ]);
    expect(load.table!.total).toMatchObject({ label: 'All days', count: 16 });
    // A five-trade cap removes the losing 6th and 7th trade of every SPY day.
    expect(load.cap?.cap).toBe(5);
  });

  it('draws the edge on its own, out of the list', () => {
    const set = buildBreakdowns(bleedsLate(), fmt, period);
    expect(set.list.map((b) => b.key)).not.toContain('edge');
    expect(set.edge!.figure.text).toMatch(/^\d+ points? (short|clear)$|^At break-even$/);
    expect(set.breakeven).not.toBeNull();
  });

  it('falls back when a chosen breakdown is gone from the new period', () => {
    const set = buildBreakdowns(bleedsLate(), fmt, period);
    expect(findEntry(set, 'sequence')?.key).toBe('sequence');
    expect(findEntry(set, 'edge')?.key).toBe('edge');
    expect(findEntry(set, 'hourly')?.key).toBe('hourly');
    expect(findEntry(set, 'expiry')).toBeNull();
    expect(findEntry(set, null)).toBeNull();
  });
});

describe('the trade after a loss', () => {
  const lead = (afterLossAvg: number, afterWinAvg: number) =>
    partsText(tiltLead({ afterLossAvg, afterLossCount: 164, afterWinAvg, afterWinCount: 127, delta: afterLossAvg - afterWinAvg }, fmt));

  it('no longer says "the same" over a gap of $36', () => {
    const words = lead(2.34, -34.03);
    expect(words).not.toContain('You trade the same');
    expect(words).toContain('The trade after a loss is worth $36.37 more than the one after a win');
  });

  it('says "about the same" only when the gap is small next to the figures', () => {
    expect(lead(-50.16, -46.18)).toContain('You trade about the same after a loss as after a win');
    expect(lead(-80, -20)).toContain('cost of trading angry');
  });
});

describe('copy and export', () => {
  it('copies a table as tab-separated lines a spreadsheet pastes into columns', () => {
    const seq = get(buildBreakdowns(bleedsLate(), fmt, period).list, 'sequence');
    const lines = breakdownTsv(seq, fmt).split('\n');
    expect(lines[1]).toBe('Trade of the day\tTrades\tWin %\tAvg / trade\tNet');
    expect(lines).toContain('4th and later\t48\t0%\t-$90.00\t-$4,320.00');
    expect(lines.at(-1)).toBe('All trades\t88\t32%\t-$25.91\t-$2,280.00');
  });

  it('exports every breakdown with its numbers unformatted, and quotes the names with commas in them', () => {
    const csv = breakdownsCsv(buildBreakdowns(bleedsLate(), fmt, period), '2026').split('\n');
    expect(csv[0]).toBe('Period,Breakdown,Group,Count,Unit,Win %,Average,Net,Value');
    expect(csv).toContain('2026,Trade of the day,4th and later,48,trades,0.0,-90.00,-4320.00,');
    expect(csv.some((l) => l.startsWith('2026,"Calls, puts, shares",Calls,48,trades,'))).toBe(true);
    expect(csv.some((l) => l.startsWith('2026,Fees,Fees,,,,,,$86.60'))).toBe(true);
  });
});
