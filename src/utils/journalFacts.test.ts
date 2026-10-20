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

/*
 * Jay: "audit the ai assistant and make sure its using max capabilities". The Performance screen's
 * breakdowns (where in the day, how busy the day, 0DTE or not, calls or puts) and the playbook were
 * computed and drawn for months while the assistant, one import away, could not see them. These
 * pin that they reach the model, through the same functions and the same sample gates.
 */
describe('the Performance screen’s breakdowns reach the model', () => {
  it('carries where each trade fell in its day, the way the screen leads with it', () => {
    const facts = buildJournalFacts(mixedBook(), 'March')!;
    expect(facts.sequence).toEqual([
      { position: '1st', trades: 20, pnl: 4000, perTrade: 200, winRate: 100 },
      { position: '2nd', trades: 20, pnl: -6000, perTrade: -300, winRate: 0 },
      { position: '3rd', trades: 20, pnl: 3000, perTrade: 150, winRate: 100 },
    ]);
  });

  it('groups whole days by how much was traded, and says nothing when every day is the same size', () => {
    // Twenty days of three trades is one bucket, and one bucket compares nothing.
    expect(buildJournalFacts(mixedBook(), 'March')!.dailyLoad).toBeNull();

    const trades = mixedBook();
    for (let day = 21; day <= 26; day += 1) trades.push(imported({ date: `2026-03-${day}`, pnl: 80 }));
    const load = buildJournalFacts(trades, 'March')!.dailyLoad!;
    expect(load.map((r) => r.tradesPerDay)).toEqual(['1–2 trades', '3–5 trades']);
    expect(load[0]).toEqual({ tradesPerDay: '1–2 trades', days: 6, net: 480, perDay: 80, greenDays: 6 });
    expect(load[1].perDay).toBe(50);
  });

  it('splits options by their expiry and by call, put and share, with the screen’s gates', () => {
    const trades: Trade[] = [];
    for (let day = 1; day <= 12; day += 1) {
      const date = `2026-03-${String(day).padStart(2, '0')}`;
      trades.push(imported({ date, pnl: -100, assetType: 'option', optionType: 'put', expiration: date }));
      trades.push(imported({ date, pnl: 150, assetType: 'option', optionType: 'call', expiration: '2026-04-17' }));
      trades.push(imported({ date, pnl: 40, assetType: 'stock' }));
    }
    const facts = buildJournalFacts(trades, 'March')!;
    expect(facts.expiry!.map((r) => [r.daysToExpiry, r.pnl])).toEqual([['0DTE', -1200], ['31+ days', 1800]]);
    expect(facts.instruments!.map((r) => [r.instrument, r.trades])).toEqual([['Calls', 12], ['Puts', 12], ['Shares', 12]]);
    // A feed with no expiries and no instrument types: null, never an empty table.
    expect(buildJournalFacts(mixedBook(), 'March')!.expiry).toBeNull();
    expect(buildJournalFacts(mixedBook(), 'March')!.instruments).toBeNull();
  });

  it('compares the days a rule was broken with the days it was kept, per day', () => {
    // The suggested question has asked this for months with nothing in the payload to answer it.
    const trades = mixedBook(); // 20 days of 3 trades, net +50 a day
    for (let day = 21; day <= 25; day += 1) trades.push(imported({ date: `2026-03-${day}`, pnl: 200 }));
    const rules = { enabled: true, maxTradesPerDay: 2 } as never;
    const facts = buildJournalFacts(trades, 'March', { rules })!;
    expect(facts.ruleDays).toEqual({ brokenDays: 20, brokenNet: 1000, brokenPerDay: 50, keptDays: 5, keptNet: 1000, keptPerDay: 200 });
    expect(facts.ruleBreachCount).toBe(20);
    // No rules, or none broken: nothing to compare.
    expect(buildJournalFacts(trades, 'March')!.ruleDays).toBeNull();
    expect(buildJournalFacts(trades, 'March', { rules: { enabled: true, maxTradesPerDay: 5 } as never })!.ruleDays).toBeNull();
  });

  it('carries the playbook rule by rule once a rule has been both kept and skipped', () => {
    const trades = mixedBook().map((t, i) => ({
      ...t,
      checklist: [{ rule: 'Wait for the open', met: i % 3 !== 1 }],
    }));
    const facts = buildJournalFacts(trades, 'March')!;
    // One rule is one row, and one row compares nothing by itself — so a second rule is needed.
    expect(facts.playbook).toBeNull();
    const two = trades.map((t, i) => ({ ...t, checklist: [...t.checklist, { rule: 'Size within plan', met: i % 3 !== 2 }] }));
    const rows = buildJournalFacts(two, 'March')!.playbook!;
    expect(rows.map((r) => r.rule)).toEqual(['Wait for the open', 'Size within plan']);
    expect(rows[0]).toMatchObject({ followed: 40, skipped: 20, skippedPerTrade: -300 });
    expect(buildJournalFacts(mixedBook(), 'March')!.playbook).toBeNull();
  });
});

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
