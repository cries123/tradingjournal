import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { JournalFacts } from './journalFacts';
import { monthlyTrend, openingFindings } from './assistantOpening';

/*
 * What the assistant leads with.
 *
 * These exist because the panel used to open on a blank thread and a list of suggested questions,
 * which asks somebody to already know what is interesting in their own history — the thing they
 * opened it to find out. The findings are computed here rather than asked of the model so that
 * opening the screen costs nothing, waits on nothing, and cannot invent a number.
 */

/** Only the fields a finding reads. The rest of JournalFacts is irrelevant to this module. */
const facts = (over: Partial<JournalFacts> = {}): JournalFacts =>
  ({
    breakeven: null,
    sizing: null,
    tilt: null,
    costs: null,
    ruleSimulation: null,
    holdTime: null,
    selfAssessment: null,
    ...over,
  }) as unknown as JournalFacts;

describe('openingFindings', () => {
  it('says nothing when there is nothing to say', () => {
    // A trader with no computable findings gets the question list, not an invented observation.
    expect(openingFindings(facts())).toEqual([]);
  });

  it('leads with the breakeven gap, because it makes the rest academic', () => {
    const out = openingFindings(
      facts({
        breakeven: { winRate: 39.9, requiredWinRate: 47.2, gap: -7.3, avgWin: 412, avgLoss: 286, payoff: 1.44, sample: 400 },
        tilt: { afterLossAvg: -80, afterWinAvg: 20, delta: -100, afterLossCount: 50, afterWinCount: 40 },
      }),
    );

    expect(out[0].tone).toBe('bad');
    expect(out[0].detail).toContain('39.9%');
    expect(out[0].detail).toContain('47.2%');
    // The gap is stated as a distance, not as a signed number the reader has to interpret.
    expect(out[0].detail).toContain('7.3 points short');
  });

  it('reads a positive gap as the good news it is', () => {
    const out = openingFindings(
      facts({
        breakeven: { winRate: 55, requiredWinRate: 48, gap: 7, avgWin: 300, avgLoss: 250, payoff: 1.2, sample: 100 },
      }),
    );
    expect(out[0].tone).toBe('good');
    expect(out[0].detail).toContain('7 points clear');
  });

  it('reports both halves of a rule simulation, never just the saving', () => {
    // A finding that quoted only the losses avoided would be selling a rule rather than testing
    // one — the same reason the simulator screen shows both numbers.
    const out = openingFindings(
      facts({
        ruleSimulation: {
          actualPnl: -5000, simulatedPnl: -1000, difference: 4000, daysChanged: 12,
          tradingDays: 60, tradesRemoved: 40, winnersGivenUp: 2000, lossesAvoided: 6000,
        },
      }),
    );

    expect(out[0].detail).toContain('$6,000');
    expect(out[0].detail).toContain('$2,000');
  });

  it('stays quiet about rules that changed nothing', () => {
    const out = openingFindings(
      facts({
        ruleSimulation: {
          actualPnl: 100, simulatedPnl: 100, difference: 0, daysChanged: 0,
          tradingDays: 60, tradesRemoved: 0, winnersGivenUp: 0, lossesAvoided: 0,
        },
      }),
    );
    expect(out).toEqual([]);
  });

  it('only raises tilt when the trade after a loss is the worse one', () => {
    const bad = openingFindings(
      facts({ tilt: { afterLossAvg: -120, afterWinAvg: 30, delta: -150, afterLossCount: 30, afterWinCount: 25 } }),
    );
    expect(bad).toHaveLength(1);

    const fine = openingFindings(
      facts({ tilt: { afterLossAvg: 40, afterWinAvg: 20, delta: 20, afterLossCount: 30, afterWinCount: 25 } }),
    );
    expect(fine).toEqual([]);
  });

  it('only raises sizing when the losers are the bigger bets', () => {
    const bad = openingFindings(
      facts({ sizing: { ratio: 1.8, avgWinnerSize: 1000, avgLoserSize: 1800, biggestQuarterPerTrade: -300, restPerTrade: -40, sample: 200 } }),
    );
    expect(bad).toHaveLength(1);

    const fine = openingFindings(
      facts({ sizing: { ratio: 0.8, avgWinnerSize: 1800, avgLoserSize: 1400, biggestQuarterPerTrade: 90, restPerTrade: 20, sample: 200 } }),
    );
    expect(fine).toEqual([]);
  });

  it('raises commissions only once they are worth raising', () => {
    const loud = openingFindings(facts({ costs: { fees: 4200, perTrade: 10.5, shareOfGross: 31, sample: 400 } }));
    expect(loud).toHaveLength(1);

    // 6% of gross is the cost of doing business, not a finding.
    const quiet = openingFindings(facts({ costs: { fees: 400, perTrade: 1, shareOfGross: 6, sample: 400 } }));
    expect(quiet).toEqual([]);
  });

  it('gives every finding a question, so each one can be argued with', () => {
    const out = openingFindings(
      facts({
        breakeven: { winRate: 39.9, requiredWinRate: 47.2, gap: -7.3, avgWin: 412, avgLoss: 286, payoff: 1.44, sample: 400 },
        tilt: { afterLossAvg: -80, afterWinAvg: 20, delta: -100, afterLossCount: 50, afterWinCount: 40 },
        costs: { fees: 4200, perTrade: 10.5, shareOfGross: 31, sample: 400 },
      }),
    );

    expect(out.length).toBeGreaterThan(2);
    for (const f of out) {
      expect(f.question.length).toBeGreaterThan(20);
      expect(f.headline).not.toBe('');
    }
  });
});

let seq = 0;
const trade = (date: string, pnl: number): Trade =>
  ({ id: `t${seq++}`, date, symbol: 'SPY', pnl }) as Trade;

describe('monthlyTrend', () => {
  it('buckets by month, oldest first', () => {
    const out = monthlyTrend([
      trade('2026-03-04', 100),
      trade('2026-01-09', -50),
      trade('2026-02-18', 20),
    ]);
    expect(out.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('keeps only the most recent months', () => {
    const trades = Array.from({ length: 10 }, (_, i) =>
      trade(`2026-${String(i + 1).padStart(2, '0')}-05`, 10),
    );
    const out = monthlyTrend(trades, 3);

    // The last three, not the first three: a trend is about where they are now.
    expect(out.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('totals and wins each month separately', () => {
    const out = monthlyTrend([
      trade('2026-01-05', 100),
      trade('2026-01-06', -40),
      trade('2026-02-05', -10),
    ]);

    expect(out[0]).toMatchObject({ month: '2026-01', netPnl: 60, trades: 2, winRate: 50 });
    expect(out[1]).toMatchObject({ month: '2026-02', netPnl: -10, trades: 1, winRate: 0 });
  });

  it('ignores scratches when working out a win rate', () => {
    // A break-even trade is neither won nor lost; counting it as a loss would understate the rate.
    const out = monthlyTrend([trade('2026-01-05', 100), trade('2026-01-06', 0)]);
    expect(out[0].winRate).toBe(100);
  });

  it('skips rows with no usable date rather than inventing a bucket', () => {
    const out = monthlyTrend([trade('2026-01-05', 10), trade('', 10), trade('nope', 10)]);
    expect(out).toHaveLength(1);
    expect(out[0].trades).toBe(1);
  });

  it('returns nothing for no trades', () => {
    expect(monthlyTrend([])).toEqual([]);
  });
});
