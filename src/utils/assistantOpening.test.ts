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

  it('leads with the trades past the first few when they give the day back', () => {
    // The Performance screen's usual headline, stated the way the screen states it.
    const out = openingFindings(
      facts({
        sequence: [
          { position: '1st', trades: 62, pnl: 705.59, perTrade: 11.38, winRate: 52 },
          { position: '2nd', trades: 56, pnl: 3552.3, perTrade: 63.43, winRate: 64 },
          { position: '3rd', trades: 47, pnl: 1271.85, perTrade: 27.06, winRate: 66 },
          { position: '4th+', trades: 139, pnl: -2537.9, perTrade: -18.26, winRate: 48 },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].figure).toBe('-$2,538');
    expect(out[0].detail).toBe('Your 4th+ trades of the day lost -$2,538 across 139. The trades before them made $5,530.');
    expect(out[0].question).toContain('4th+');
  });

  it('says nothing about the sequence when the later trades pay, or when nothing does', () => {
    const later = openingFindings(
      facts({
        sequence: [
          { position: '1st', trades: 30, pnl: -500, perTrade: -16, winRate: 40 },
          { position: '2nd', trades: 30, pnl: 900, perTrade: 30, winRate: 60 },
        ],
      }),
    );
    expect(later).toEqual([]);
    // Every position losing is not "your later trades give the day back"; there was no day to give.
    const all = openingFindings(
      facts({
        sequence: [
          { position: '1st', trades: 30, pnl: -500, perTrade: -16, winRate: 40 },
          { position: '2nd+', trades: 30, pnl: -300, perTrade: -10, winRate: 45 },
        ],
      }),
    );
    expect(all).toEqual([]);
  });

  it('states the busy-days finding with the pitch’s own shape: busy days lose, quiet days win', () => {
    const out = openingFindings(
      facts({
        dailyLoad: [
          { tradesPerDay: '1–2 trades', days: 14, net: 2282, perDay: 163, greenDays: 10 },
          { tradesPerDay: '3–5 trades', days: 20, net: 400, perDay: 20, greenDays: 11 },
          { tradesPerDay: '11+ trades', days: 9, net: -4464, perDay: -496, greenDays: 2 },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].detail).toBe('Days with 11+ trades average -$496 across 9 days. Days with 1–2 trades average $163 across 14.');
    expect(out[0].tone).toBe('bad');
    // Busy days that also win are not a finding, and neither are busy days that lose when the
    // quiet days lose too: "your busy days lose" implies the quiet ones don't.
    expect(openingFindings(facts({ dailyLoad: [{ tradesPerDay: '1–2 trades', days: 5, net: 100, perDay: 20, greenDays: 3 }, { tradesPerDay: '6–10 trades', days: 5, net: 300, perDay: 60, greenDays: 4 }] }))).toEqual([]);
    expect(openingFindings(facts({ dailyLoad: [{ tradesPerDay: '1–2 trades', days: 5, net: -100, perDay: -20, greenDays: 1 }, { tradesPerDay: '6–10 trades', days: 5, net: -300, perDay: -60, greenDays: 1 }] }))).toEqual([]);
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

describe('a finding as a starting point', () => {
  /*
   * The Assistant page leads each starting point with one number and the rest of the sentence
   * after it — "23 pts" + "short of the win rate your payoff needs". The number is the same one the
   * detail quotes, so the card and the dock can never disagree.
   */
  const only = (over: Partial<JournalFacts>) => openingFindings(facts(over))[0];

  it('states a breakeven gap as a distance in points', () => {
    const short = only({ breakeven: { winRate: 39.9, requiredWinRate: 47.2, gap: -7.3, avgWin: 412, avgLoss: 286, payoff: 1.44, sample: 400 } });
    expect([short.figure, short.lead]).toEqual(['7.3 pts', 'short of the win rate your payoff needs']);
    const clear = only({ breakeven: { winRate: 55, requiredWinRate: 48, gap: 7, avgWin: 300, avgLoss: 250, payoff: 1.2, sample: 100 } });
    expect([clear.figure, clear.lead]).toEqual(['7 pts', 'clear of the win rate your payoff needs']);
  });

  it('gives the trades past the limits what they made between them, with its sign', () => {
    // difference is simulated − actual, so the removed trades made −difference. A saving of $4,000
    // means those trades lost $4,000; a cost of $600 means they made $600.
    const sim = { actualPnl: 0, simulatedPnl: 0, daysChanged: 12, tradingDays: 60, tradesRemoved: 40, winnersGivenUp: 2000, lossesAvoided: 6000 };
    const helped = only({ ruleSimulation: { ...sim, difference: 4000 } });
    expect([helped.figure, helped.lead]).toEqual(['-$4,000', 'came from trades past your own limits']);
    const cost = only({ ruleSimulation: { ...sim, difference: -600 } });
    expect(cost.figure).toBe('+$600');
  });

  it('leads tilt, sizing and costs with their own numbers', () => {
    expect(only({ tilt: { afterLossAvg: -80, afterWinAvg: 20, delta: -100, afterLossCount: 50, afterWinCount: 40 } }).figure).toBe('$100');
    expect(only({ sizing: { ratio: 1.8, avgWinnerSize: 1000, avgLoserSize: 1800, biggestQuarterPerTrade: -300, restPerTrade: -40, sample: 200 } }).figure).toBe('1.8x');
    expect(only({ costs: { fees: 4200, perTrade: 10.5, shareOfGross: 31, sample: 400 } }).figure).toBe('31%');
  });

  it('has no figure where the finding has no single number, and says it in words', () => {
    const hold = only({ holdTime: { holdsLosersLonger: true } as JournalFacts['holdTime'] });
    expect(hold.figure).toBeNull();
    expect(hold.lead).toBe(hold.headline);
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
