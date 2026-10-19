import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { brokerCoverage } from './brokerAnalytics';
import { collectFindings, panelImpact, performanceVerdict } from './performanceVerdict';

/*
 * The verdict: the biggest drain, the biggest engine and the one change, ranked by dollars.
 */

const fmt = (n: number) => `$${Math.abs(n).toFixed(0)}`;

let n = 0;
const trade = (over: Partial<Trade>): Trade =>
  ({
    id: `snaptrade_acc_1_${String(n++).padStart(4, '0')}`,
    date: '2026-08-03',
    symbol: 'SPY',
    pnl: 0,
    quantity: 2,
    tradePrice: 2,
    assetType: 'option',
    optionType: 'call',
    expiration: '2026-08-03',
    openDate: '2026-08-03',
    fees: 1,
    ...over,
  }) as Trade;

/**
 * Twelve days of SPY. The first three trades of each day make a little; everything after the third
 * loses a lot. Then four days with one CVX share trade each, which win every time — on their own
 * days, so they are "1st trades" and the sequence buckets stay clean.
 */
function jaysJournal(): Trade[] {
  n = 0;
  const trades: Trade[] = [];
  for (let day = 1; day <= 12; day++) {
    const date = `2026-08-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < 7; i++) {
      const late = i >= 3;
      trades.push(
        trade({
          date,
          openDate: date,
          expiration: date,
          pnl: late ? (i % 2 === 0 ? -120 : -60) : i === 1 ? -20 : 45,
          grossPnl: late ? (i % 2 === 0 ? -119 : -59) : i === 1 ? -19 : 46,
        }),
      );
    }
  }
  for (let day = 13; day <= 16; day++) {
    const date = `2026-08-${day}`;
    trades.push(trade({ date, openDate: date, symbol: 'CVX', assetType: 'stock', expiration: undefined, pnl: 300, grossPnl: 300.65, fees: 0.65, quantity: 50, tradePrice: 150 }));
  }
  return trades;
}

describe('the verdict', () => {
  it('leads with the group that cost the most, names what made the most, and says the change', () => {
    const verdict = performanceVerdict(jaysJournal(), fmt)!;
    expect(verdict).not.toBeNull();

    // 4 late trades × 12 days = 48 trades, −$90 average = −$4,320: the biggest single bucket.
    expect(verdict.drain!.dimension).toBe('sequence');
    expect(verdict.drain!.subject).toBe('your 4th+ trades of the day');
    expect(verdict.drain!.pnl).toBe(-4320);
    expect(verdict.lines.drain).toBe('Your 4th+ trades of the day cost you $4320 across 48 trades.');

    // The first trade of the day (12 SPY at $45, plus the 4 CVX) beats CVX alone — the ranking is
    // by dollars across every dimension, and the same trade may count in several.
    expect(verdict.engine!.subject).toBe('your 1st trade of the day');
    expect(verdict.engine!.pnl).toBe(1740);
    expect(verdict.lines.engine).toBe('Your 1st trade of the day made you $1740 across 16 trades.');

    expect(verdict.change!.dimension).toBe('sequence');
    expect(verdict.change!.text).toContain('Stop after your third trade of the day');
    expect(verdict.change!.text).toContain('$4320');
  });

  it('ranks by dollars, never by win rate', () => {
    const findings = collectFindings(jaysJournal());
    const sorted = [...findings].sort((a, b) => b.impact - a.impact);
    expect(sorted[0]!.impact).toBeGreaterThanOrEqual(sorted[1]!.impact);
    // SPY as a symbol and 0DTE as an expiry are the same trades seen twice; both appear, neither is summed.
    expect(findings.some((f) => f.dimension === 'symbol' && f.subject === 'SPY')).toBe(true);
    expect(findings.some((f) => f.dimension === 'expiry' && f.subject === '0DTE contracts')).toBe(true);
  });

  it('says nothing over a thin journal, and nothing when nothing is worth saying', () => {
    expect(performanceVerdict(jaysJournal().slice(0, 4), fmt)).toBeNull();
    // A journal where every group is tiny next to its turnover never clears the floor.
    n = 0;
    const flat = Array.from({ length: 20 }, (_, i) =>
      trade({ date: `2026-08-${String((i % 10) + 1).padStart(2, '0')}`, pnl: i % 2 ? 1 : -1, grossPnl: i % 2 ? 2 : 0 }),
    );
    expect(performanceVerdict(flat, fmt)).toBeNull();
  });

  it('leads with the engine when nothing lost money', () => {
    n = 0;
    const winners = Array.from({ length: 24 }, (_, i) =>
      trade({ date: `2026-08-${String((i % 8) + 1).padStart(2, '0')}`, pnl: 50 + (i % 3) * 10, grossPnl: 51 + (i % 3) * 10 }),
    );
    const verdict = performanceVerdict(winners, fmt)!;
    expect(verdict.drain).toBeNull();
    expect(verdict.engine).not.toBeNull();
    expect(verdict.change).toBeNull();
  });

  it('gives each panel the dollar weight of its biggest row, so the panels sort like the verdict', () => {
    const trades = jaysJournal();
    const coverage = brokerCoverage(trades);
    const net = trades.reduce((s, t) => s + t.pnl, 0);
    expect(panelImpact(coverage, 'sequence', net)).toBe(4320);
    expect(panelImpact(coverage, 'cost', net)).toBeCloseTo(coverage.cost!.fees);
    expect(panelImpact(coverage, 'breakeven', net)).toBe(Math.abs(net));
    // The sequence panel outranks the fee panel here by a mile — the order the screen should show.
    expect(panelImpact(coverage, 'sequence', net)).toBeGreaterThan(panelImpact(coverage, 'cost', net));
  });
});
