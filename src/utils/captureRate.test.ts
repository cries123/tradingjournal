import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { buildJournalFacts, suggestedQuestions } from './journalFacts';

/*
 * What the assistant is told about capture rate when there is nothing to measure.
 *
 * tradeQuality gates its result with an OR — it answers when EITHER the MFE sample or the heat
 * sample is big enough — which is right, because it keeps the MAE-only heat figures available for a
 * trader who records drawdown but not runup. But capture rate is computed from WINNERS, and with none
 * of them it fell out as 0 rather than as nothing.
 *
 * The assistant is told that a null field means "not recorded", so a zero reads as a measurement: a
 * run of losers carrying MAE produced "you captured 0% of your winners' peak" and offered "am I
 * exiting winners too early?", which fires on anything under 85. The dashboard stays quiet in that
 * state because its own consumer checks the sample first — so the model was being told something no
 * screen in the product would say.
 */

let seq = 0;
const losingTrade = (over: Partial<Trade> = {}): Trade => {
  seq += 1;
  return {
    id: `t${seq}`,
    date: `2026-03-${String((seq % 20) + 1).padStart(2, '0')}`,
    symbol: 'SPY',
    side: 'long',
    quantity: 1,
    tradePrice: 10,
    exitPrice: 9,
    pnl: -100,
    // Drawdown recorded, runup not — the shape that produced the phantom zero.
    mae: 150,
    sourceId: `snaptrade:o${seq}:c${seq}`,
    ...over,
  } as unknown as Trade;
};

const losersOnly = () => Array.from({ length: 8 }, () => losingTrade());

describe('capture rate with no winners', () => {
  it('is withheld rather than reported as zero', () => {
    const facts = buildJournalFacts(losersOnly(), 'March 2026');

    expect(facts?.execution).not.toBeNull();
    expect(facts?.execution?.captureRate).toBeNull();
    expect(facts?.execution?.leftOnTable).toBeNull();
  });

  it('still reports the heat figures, which are what that sample measures', () => {
    // The OR gate in tradeQuality exists for exactly this trader, so the fix must not take it away.
    const facts = buildJournalFacts(losersOnly(), 'March 2026');

    expect(facts?.execution?.avgHeatOnLosers).toBeGreaterThan(0);
    expect(facts?.execution?.sampleSize).toBe(0);
  });

  it('does not offer "am I exiting winners too early?"', () => {
    /*
     * The prompt fired on `captureRate < 85`, which a zero always satisfies — so the one question the
     * data cannot answer was the one being suggested.
     */
    const facts = buildJournalFacts(losersOnly(), 'March 2026');
    const offered = suggestedQuestions(facts!).map((f) => f.id);

    expect(offered).not.toContain('capture');
  });
});

describe('capture rate with winners to measure', () => {
  const withWinners = (): Trade[] => {
    const trades = losersOnly();
    for (let i = 0; i < 5; i += 1) {
      trades.push(
        losingTrade({
          pnl: 100,
          exitPrice: 11,
          // Took 200 of runup and kept 100 of it: half the peak.
          mfe: 200,
          mae: 20,
        }),
      );
    }
    return trades;
  };

  it('reports a real rate', () => {
    const facts = buildJournalFacts(withWinners(), 'March 2026');

    expect(facts?.execution?.captureRate).not.toBeNull();
    expect(facts?.execution?.sampleSize).toBeGreaterThanOrEqual(3);
  });

  it('wants three winners before it will say anything, like the dashboard does', () => {
    /*
     * The threshold matters, not just the existence of a guard: the takeaway's own consumer uses
     * `winnerSample >= 3`, and a capture rate drawn from one or two winners is an anecdote the model
     * would state as a finding. Two winners here, so a weaker gate shows up as a number.
     */
    const twoWinners = losersOnly();
    for (let i = 0; i < 2; i += 1) {
      twoWinners.push(losingTrade({ pnl: 100, exitPrice: 11, mfe: 200, mae: 20 }));
    }

    const facts = buildJournalFacts(twoWinners, 'March 2026');

    expect(facts?.execution?.sampleSize).toBe(2);
    expect(facts?.execution?.captureRate).toBeNull();
  });

  it('offers the question once there is something behind it', () => {
    const facts = buildJournalFacts(withWinners(), 'March 2026');
    const offered = suggestedQuestions(facts!).map((f) => f.id);

    expect(offered).toContain('capture');
  });
});
