import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { buildJournalFacts } from './journalFacts';

/*
 * What actually reaches the model.
 *
 * buildJournalFacts had no tests at all, which is how it went months handing the assistant an
 * object whose richest fields were null for almost everybody: R multiples, hold time, the A-F
 * grades and the checklist all need a hand-entered field or a fill time, and the broker most
 * people here sync from sends a date with no time. The assistant then answered nearly everything
 * with "I don't have that" while the Performance screen, one import away, was drawing real
 * findings from the same trades.
 *
 * These tests pin the half that survives a bare broker feed, because that is the half that has to
 * keep working.
 */

let seq = 0;

/** A synced trade: everything here comes off a broker feed, nothing is hand-entered. */
function imported(over: Partial<Trade> = {}): Trade {
  seq += 1;
  return {
    id: `t${seq}`,
    date: '2026-03-02',
    symbol: 'SPY',
    side: 'long',
    quantity: 1,
    entryPrice: 10,
    tradePrice: 10,
    exitPrice: 12,
    pnl: 100,
    fees: 1.3,
    sourceId: `snaptrade:o${seq}:c${seq}`,
    ...over,
  } as unknown as Trade;
}

/** Enough winners and losers, across enough days, to clear the analytics sample gates. */
function mixedBook(): Trade[] {
  const trades: Trade[] = [];
  for (let day = 1; day <= 20; day += 1) {
    const date = `2026-03-${String(day).padStart(2, '0')}`;
    trades.push(imported({ date, pnl: 200, quantity: 1 }));
    trades.push(imported({ date, pnl: -300, quantity: 3 }));
    trades.push(imported({ date, pnl: 150, quantity: 1 }));
  }
  return trades;
}

describe('buildJournalFacts', () => {
  it('returns nothing for an empty period rather than an empty shell', () => {
    expect(buildJournalFacts([], 'March')).toBeNull();
  });

  it('carries the breakeven gap, which is the finding the assistant leads with', () => {
    const facts = buildJournalFacts(mixedBook(), 'March')!;

    expect(facts.breakeven).not.toBeNull();
    expect(facts.breakeven!.requiredWinRate).toBeGreaterThan(0);
    /*
     * Close to the difference, not equal to it.
     *
     * gap is rounded from the exact subtraction while winRate and requiredWinRate are each
     * rounded on their own, so recomputing from the rounded pair drifts a tenth. The stored gap
     * is the more accurate of the two, which is why the page quotes it rather than deriving it.
     */
    expect(facts.breakeven!.gap).toBeCloseTo(
      facts.breakeven!.winRate - facts.breakeven!.requiredWinRate,
      0,
    );
    expect(facts.breakeven!.gap).not.toBe(0);
  });

  it('carries sizing, tilt and costs from a feed with no fill times', () => {
    // None of these need an entry time, an R multiple or a grade — that is the point of them.
    const facts = buildJournalFacts(mixedBook(), 'March')!;

    expect(facts.sizing).not.toBeNull();
    expect(facts.tilt).not.toBeNull();
    expect(facts.costs).not.toBeNull();
    expect(facts.costs!.fees).toBeGreaterThan(0);
  });

  it('leaves the hand-entered blocks null rather than inventing them', () => {
    // The honest half of the same story: a synced trade has no grade or checklist, and the model
    // is told so rather than shown a zero it might reason from.
    const facts = buildJournalFacts(mixedBook(), 'March')!;

    expect(facts.selfAssessment).toBeNull();
    expect(facts.checklist).toBeNull();
    expect(facts.rMultiple).toBeNull();
  });

  it('only simulates rules the trader actually set', () => {
    const trades = mixedBook();

    expect(buildJournalFacts(trades, 'March')!.ruleSimulation).toBeNull();
    expect(
      buildJournalFacts(trades, 'March', { rules: { enabled: true } })!.ruleSimulation,
    ).toBeNull();

    const withCap = buildJournalFacts(trades, 'March', {
      rules: { enabled: true, maxTradesPerDay: 2 },
    })!;
    expect(withCap.ruleSimulation).not.toBeNull();
    expect(withCap.ruleSimulation!.daysChanged).toBeGreaterThan(0);
  });

  it('passes a stop-after-N-losers rule through, which the old options shape dropped', () => {
    // JournalFactsOptions used to declare a hand-copied subset of TradingRules with no
    // maxConsecutiveLosses, so this rule was silently discarded on the way to the model.
    const facts = buildJournalFacts(mixedBook(), 'March', {
      rules: { enabled: true, maxConsecutiveLosses: 1 },
    })!;

    expect(facts.ruleSimulation).not.toBeNull();
  });

  it('only includes the trend when history is supplied, and only once it is a trend', () => {
    const trades = mixedBook();

    expect(buildJournalFacts(trades, 'March')!.recentMonths).toBeNull();
    // One month of history is this period again, not a run.
    expect(buildJournalFacts(trades, 'March', { history: trades })!.recentMonths).toBeNull();

    const twoMonths = [...trades, ...mixedBook().map((t) => ({ ...t, date: '2026-04-02' }))];
    const facts = buildJournalFacts(trades, 'March', { history: twoMonths })!;

    expect(facts.recentMonths).toHaveLength(2);
    expect(facts.recentMonths!.map((m) => m.month)).toEqual(['2026-03', '2026-04']);
  });

  it('withholds notes unless the trader opted in', () => {
    const trades = mixedBook();
    trades[0] = { ...trades[0], notes: 'chased it' };

    expect(buildJournalFacts(trades, 'March')!.notes).toBeNull();
    expect(buildJournalFacts(trades, 'March', { includeNotes: true })!.notes).toHaveLength(1);
  });
});
