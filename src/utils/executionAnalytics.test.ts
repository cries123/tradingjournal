import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import {
  disciplineStats,
  excursionStats,
  executionCoverage,
  expectancyStats,
  hasAnyExecutionData,
  hourlyBreakdown,
  MIN_SAMPLE,
  parseHour,
  symbolPerformance,
  tagPerformance,
} from './executionAnalytics';
import { execClockTime } from './parseSchwabCsv';

function trade(over: Partial<Trade> = {}): Trade {
  return { id: Math.random().toString(36), date: '2026-08-03', symbol: 'AAPL', pnl: 100, ...over };
}

describe('parseHour', () => {
  it('reads the hour out of a HH:MM entry time', () => {
    expect(parseHour('09:34')).toBe(9);
    expect(parseHour('16:00')).toBe(16);
    expect(parseHour('9:05')).toBe(9);
  });

  it('rejects anything that is not a clock time', () => {
    expect(parseHour(undefined)).toBeNull();
    expect(parseHour('')).toBeNull();
    expect(parseHour('lunchtime')).toBeNull();
    expect(parseHour('34:00')).toBeNull();
  });
});

describe('hourlyBreakdown', () => {
  const morning = Array.from({ length: 4 }, () => trade({ entryTime: '09:31', pnl: 200 }));
  const afternoon = Array.from({ length: 3 }, () => trade({ entryTime: '14:10', pnl: -150 }));

  it('says nothing until it has a real sample', () => {
    expect(hourlyBreakdown([trade({ entryTime: '09:31' })])).toBeNull();
    expect(hourlyBreakdown(Array.from({ length: MIN_SAMPLE - 1 }, () => trade({ entryTime: '09:31' })))).toBeNull();
  });

  it('ignores trades with no entry time rather than counting them as midnight', () => {
    const mixed = [...morning, ...afternoon, trade({ pnl: 9999 })];
    const out = hourlyBreakdown(mixed)!;
    expect(out.covered).toBe(7);
    expect(out.rows.reduce((sum, r) => sum + r.trades, 0)).toBe(7);
  });

  it('finds the best and worst hour', () => {
    const out = hourlyBreakdown([...morning, ...afternoon])!;
    expect(out.best.hour).toBe(9);
    expect(out.best.pnl).toBe(800);
    expect(out.worst.hour).toBe(14);
    expect(out.worst.pnl).toBe(-450);
  });

  it('keeps untraded hours in the middle of the session so the axis is not compressed', () => {
    const out = hourlyBreakdown([...morning, ...afternoon])!;
    expect(out.rows.map((r) => r.hour)).toEqual([9, 10, 11, 12, 13, 14]);
    expect(out.rows.find((r) => r.hour === 11)!.trades).toBe(0);
  });

  it('labels hours the way a person reads a clock', () => {
    const out = hourlyBreakdown([...morning, ...afternoon])!;
    expect(out.rows[0].label).toBe('9am');
    expect(out.rows.at(-1)!.label).toBe('2pm');
  });
});

describe('expectancyStats', () => {
  it('says nothing without enough graded-risk trades', () => {
    expect(expectancyStats([trade({ rMultiple: 2 })])).toBeNull();
  });

  it('reports average R per trade', () => {
    const trades = [
      trade({ rMultiple: 2 }),
      trade({ rMultiple: 2 }),
      trade({ rMultiple: -1 }),
      trade({ rMultiple: -1 }),
      trade({ rMultiple: -1 }),
    ];
    const out = expectancyStats(trades)!;
    expect(out.expectancy).toBeCloseTo(0.2);
    expect(out.avgWinR).toBe(2);
    expect(out.avgLossR).toBe(-1);
    expect(out.winRate).toBeCloseTo(40);
    expect(out.covered).toBe(5);
  });

  it('catches a losing system hiding behind a good win rate', () => {
    const trades = [
      trade({ rMultiple: 0.4 }),
      trade({ rMultiple: 0.4 }),
      trade({ rMultiple: 0.4 }),
      trade({ rMultiple: 0.4 }),
      trade({ rMultiple: -3 }),
    ];
    const out = expectancyStats(trades)!;
    expect(out.winRate).toBe(80);
    expect(out.expectancy).toBeLessThan(0);
  });
});

describe('excursionStats', () => {
  const trades = [
    trade({ pnl: 300, mae: 120, mfe: 400 }),
    trade({ pnl: 250, mae: 100, mfe: 350 }),
    trade({ pnl: 200, mae: 80, mfe: 300 }),
    trade({ pnl: -100, mae: 150, mfe: 220 }),
    trade({ pnl: -120, mae: 170, mfe: 260 }),
  ];

  it('splits excursions by how the trade ended', () => {
    const out = excursionStats(trades)!;
    expect(out.avgMaeWinners).toBeCloseTo(100);
    expect(out.avgMaeLosers).toBeCloseTo(160);
    expect(out.avgMfeLosers).toBeCloseTo(240);
    expect(out.coveredMae).toBe(5);
  });

  it('treats adverse excursion recorded as a negative number the same as a magnitude', () => {
    const negative = trades.map((t) => ({ ...t, mae: -(t.mae ?? 0) }));
    expect(excursionStats(negative)!.avgMaeWinners).toBeCloseTo(100);
  });

  it('says nothing when neither excursion is recorded often enough', () => {
    expect(excursionStats([trade({ mae: 100 }), trade({ mfe: 100 })])).toBeNull();
  });
});

describe('disciplineStats', () => {
  it('puts P&L beside the grade the trader gave themselves', () => {
    const trades = [
      trade({ grade: 'A', pnl: 100 }),
      trade({ grade: 'A', pnl: 200 }),
      trade({ grade: 'C', pnl: -50 }),
      trade({ grade: 'C', pnl: -80 }),
      trade({ grade: 'F', pnl: -300 }),
    ];
    const out = disciplineStats(trades)!;
    expect(out.grades.map((g) => g.grade)).toEqual(['A', 'C', 'F']);
    expect(out.grades[0].pnl).toBe(300);
    expect(out.coveredGrades).toBe(5);
  });

  it('compares following the checklist against ignoring it', () => {
    const trades = [
      trade({ checklistScore: 100, pnl: 200 }),
      trade({ checklistScore: 90, pnl: 100 }),
      trade({ checklistScore: 80, pnl: 300 }),
      trade({ checklistScore: 40, pnl: -200 }),
      trade({ checklistScore: 10, pnl: -400 }),
    ];
    const out = disciplineStats(trades)!;
    expect(out.followedCount).toBe(3);
    expect(out.ignoredCount).toBe(2);
    expect(out.followedPerTrade).toBeCloseTo(200);
    expect(out.ignoredPerTrade).toBeCloseTo(-300);
  });

  it('says nothing when neither column is filled in', () => {
    expect(disciplineStats([trade(), trade(), trade(), trade(), trade()])).toBeNull();
  });
});

describe('tagPerformance', () => {
  it('sorts by money, so a high win rate that loses money surfaces rather than hides', () => {
    /* Fade has the BETTER win rate and the worse P&L, deliberately: if this sorted by win rate
       the losing setup would lead the list, so the two orderings disagree and the assertion
       actually pins the one that matters. */
    const trades = [
      trade({ setup: 'Breakout', pnl: 400 }),
      trade({ setup: 'Breakout', pnl: 300 }),
      trade({ setup: 'Breakout', pnl: -300 }),
      ...Array.from({ length: 4 }, () => trade({ setup: 'Fade', pnl: 50 })),
      trade({ setup: 'Fade', pnl: -600 }),
    ];
    const rows = tagPerformance(trades);

    const breakout = rows.find((r) => r.tag === 'Breakout')!;
    const fade = rows.find((r) => r.tag === 'Fade')!;
    expect(fade.winRate).toBeGreaterThan(breakout.winRate);
    expect(fade.pnl).toBeLessThan(0);
    expect(breakout.pnl).toBeGreaterThan(0);
    expect(rows[0].tag).toBe('Breakout');
  });

  it('ignores a tag with too few trades to mean anything', () => {
    const trades = [
      ...Array.from({ length: 3 }, () => trade({ setup: 'Breakout' })),
      trade({ setup: 'OnceOff', pnl: 5000 }),
    ];
    expect(tagPerformance(trades).map((r) => r.tag)).toEqual(['Breakout']);
  });

  it('counts both the setup field and the tags array', () => {
    const trades = Array.from({ length: 3 }, () => trade({ setup: 'Breakout', tags: ['Momentum'] }));
    expect(tagPerformance(trades).map((r) => r.tag).sort()).toEqual(['Breakout', 'Momentum']);
  });
});

describe('executionCoverage', () => {
  it('still has something to show for plain trades with no enrichment at all', () => {
    /* This used to assert the opposite, and the opposite was the bug: a journal built from CSV
       imports opened the Performance screen and found five locked cards. Symbols draw from a
       ticker and a P&L, which every trade has, so the screen is never entirely empty. */
    const plain = Array.from({ length: 20 }, () => trade());
    const coverage = executionCoverage(plain);
    expect(coverage.hourly).toBeNull();
    expect(coverage.expectancy).toBeNull();
    expect(coverage.discipline).toBeNull();
    expect(coverage.symbols.length).toBeGreaterThan(0);
    expect(hasAnyExecutionData(coverage)).toBe(true);
  });

  it('reports the time panel alone when only entry times are present', () => {
    const synced = Array.from({ length: 8 }, () => trade({ entryTime: '10:15' }));
    const coverage = executionCoverage(synced);
    expect(hasAnyExecutionData(coverage)).toBe(true);
    expect(coverage.hourly).not.toBeNull();
    expect(coverage.expectancy).toBeNull();
    expect(coverage.discipline).toBeNull();
  });
});

describe('symbolPerformance', () => {
  it('draws from nothing but a ticker and a P&L, which every trade has', () => {
    const bare = [
      ...Array.from({ length: 3 }, () => trade({ symbol: 'SPY', pnl: 200 })),
      ...Array.from({ length: 4 }, () => trade({ symbol: 'TSLA', pnl: -150 })),
    ];
    const rows = symbolPerformance(bare);
    expect(rows.map((r) => r.tag)).toEqual(['SPY', 'TSLA']);
    expect(rows[0].pnl).toBe(600);
  });

  it('is the panel that keeps the screen from being entirely locked', () => {
    // No entry times, no tags, no R, no MAE, no grades — a CSV-imported journal.
    const imported = Array.from({ length: 12 }, () => trade({ symbol: 'SPY' }));
    const coverage = executionCoverage(imported);
    expect(coverage.hourly).toBeNull();
    expect(coverage.expectancy).toBeNull();
    expect(coverage.tags).toEqual([]);
    expect(coverage.symbols.length).toBe(1);
    expect(hasAnyExecutionData(coverage)).toBe(true);
  });

  it('ignores a ticker with too few trades to mean anything', () => {
    const trades = [
      ...Array.from({ length: 3 }, () => trade({ symbol: 'SPY' })),
      trade({ symbol: 'ONCE', pnl: 5000 }),
    ];
    expect(symbolPerformance(trades).map((r) => r.tag)).toEqual(['SPY']);
  });

  it('folds case so spy and SPY are one ticker', () => {
    const trades = [
      trade({ symbol: 'spy', pnl: 100 }),
      trade({ symbol: 'SPY', pnl: 100 }),
      trade({ symbol: 'Spy', pnl: 100 }),
    ];
    expect(symbolPerformance(trades)).toHaveLength(1);
    expect(symbolPerformance(trades)[0].trades).toBe(3);
  });
});

describe('execClockTime', () => {
  it('keeps the time the CSV importer used to throw away', () => {
    expect(execClockTime('8/29/26 10:31:14')).toBe('10:31');
    expect(execClockTime('2026-08-29 09:05:00')).toBe('09:05');
  });

  it('normalises a 12-hour export so afternoon sorts after morning', () => {
    expect(execClockTime('8/29/26 1:05:00 PM')).toBe('13:05');
    expect(execClockTime('8/29/26 11:05:00 AM')).toBe('11:05');
    expect(execClockTime('8/29/26 12:30:00 AM')).toBe('00:30');
    expect(execClockTime('8/29/26 12:30:00 PM')).toBe('12:30');
  });

  it('returns nothing rather than inventing midnight', () => {
    expect(execClockTime('8/29/26')).toBeUndefined();
    expect(execClockTime('')).toBeUndefined();
    expect(execClockTime('99:99')).toBeUndefined();
  });
});
