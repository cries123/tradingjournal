import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import {
  describeTradeForDeletion,
  effectivePnl,
  holdTimeMinutes,
  marketSessionFromTime,
} from './tradeHelpers';

const trade = (over: Partial<Trade>): Trade =>
  ({ id: '1', date: '2026-08-03', symbol: 'SPY', pnl: 0, ...over }) as Trade;

describe('effectivePnl', () => {
  it('recomputes from gross when both gross and fees are present', () => {
    expect(effectivePnl(trade({ pnl: 90, grossPnl: 100, fees: 10 }))).toBe(90);
  });

  it('agrees with the stored pnl on synced trades', () => {
    // mapSnapTradeActivities and parseSchwabCsv both store pnl = grossPnl - fees and set all
    // three fields, so the two ways of asking for the number must not disagree. If this breaks,
    // the dashboard total and every effectivePnl consumer start telling the user different money.
    const gross = 250.5;
    const fees = 1.3;
    const synced = trade({ grossPnl: gross, fees, pnl: gross - fees });
    expect(effectivePnl(synced)).toBeCloseTo(synced.pnl, 10);
  });

  it('passes pnl straight through when no fees are recorded', () => {
    expect(effectivePnl(trade({ pnl: -42 }))).toBe(-42);
  });

  it('leaves a hand-entered pnl alone when there is no gross to net against', () => {
    /*
     * The ambiguity this used to document is now resolved, in the direction the product already
     * promised twice: TradeModal labels the field "Net P/L ($)" and types.ts says fees are
     * subtracted "when grossPnl set". So a typed pnl is already net, and taking the fees off again
     * charged them twice — which this test's old comment predicted word for word.
     *
     * It was not a harmless rounding difference. computeStats, the calendar and the insights panel
     * read trade.pnl directly while the Performance screen, the rule banner, the simulator, the tax
     * report and the AI facts read effectivePnl, so the same month showed two different totals and
     * nothing on screen said which was right.
     */
    expect(effectivePnl(trade({ pnl: 100, fees: 7 }))).toBe(100);
  });

  it('still nets an imported trade, which carries a real gross', () => {
    // The branch that was always correct: a synced trade has grossPnl, so the fees have something
    // to come off. This is the one the fix must not disturb.
    expect(effectivePnl(trade({ grossPnl: 100, fees: 7, pnl: 93 }))).toBe(93);
  });
});

describe('describeTradeForDeletion', () => {
  it('names the contract, the size and the money', () => {
    // The whole point: the X sits beside the edit pencil on rows that look alike, so the dialog has
    // to identify which row it is about.
    const message = describeTradeForDeletion(
      trade({ contract: 'SPY 29 SEP 26 660 C', quantity: 4, pnl: 287 }),
    );

    expect(message).toContain('SPY 29 SEP 26 660 C');
    expect(message).toContain('4');
    expect(message).toContain('287');
    expect(message).toContain('cannot be undone');
  });

  it('falls back to the symbol when there is no contract string', () => {
    expect(describeTradeForDeletion(trade({ symbol: 'AAPL', pnl: -40 }))).toContain('AAPL');
  });

  it('warns about the work that goes with it', () => {
    const message = describeTradeForDeletion(
      trade({ notes: 'faded the open', tags: ['reversal'], grade: 'B' }),
    );

    expect(message).toContain('notes, tags and grade');
    expect(message).toContain('broker sync cannot bring those back');
  });

  it('says nothing about annotations on a bare synced row', () => {
    // A re-sync genuinely does restore this one, so the warning would be false.
    const message = describeTradeForDeletion(trade({ sourceId: 'snaptrade:o1:c1' }));

    expect(message).not.toContain('go too');
    expect(message).toContain('cannot be undone');
  });

  it('reads as a sentence with exactly one annotation', () => {
    // The list joiner is the kind of thing that ships as "The notes and you saved on it".
    expect(describeTradeForDeletion(trade({ notes: 'late entry' }))).toContain(
      'The notes you saved on it go too',
    );
  });
});

describe('holdTimeMinutes', () => {
  it('returns null unless both ends of the trade are known', () => {
    expect(holdTimeMinutes(trade({ entryTime: '09:35' }))).toBeNull();
    expect(holdTimeMinutes(trade({ exitTime: '10:05' }))).toBeNull();
    expect(holdTimeMinutes(trade({}))).toBeNull();
  });

  it('measures across the hour boundary', () => {
    expect(holdTimeMinutes(trade({ entryTime: '09:35', exitTime: '10:05' }))).toBe(30);
  });

  it('returns null on unparseable times rather than NaN', () => {
    expect(holdTimeMinutes(trade({ entryTime: 'open', exitTime: '10:05' }))).toBeNull();
  });
});

describe('marketSessionFromTime', () => {
  it('places times in the session a trader would name', () => {
    expect(marketSessionFromTime('08:00')).toBe('Premarket');
    expect(marketSessionFromTime('09:31')).toBe('Open');
    expect(marketSessionFromTime('11:00')).toBe('Midday');
    expect(marketSessionFromTime('15:30')).toBe('Close');
    expect(marketSessionFromTime('17:00')).toBe('After hours');
  });

  it('puts each boundary minute in the later session', () => {
    expect(marketSessionFromTime('09:29')).toBe('Premarket');
    expect(marketSessionFromTime('09:30')).toBe('Open');
    expect(marketSessionFromTime('10:30')).toBe('Midday');
    expect(marketSessionFromTime('12:00')).toBe('Close');
  });

  it('returns null for a missing or malformed time', () => {
    expect(marketSessionFromTime(undefined)).toBeNull();
    expect(marketSessionFromTime('lunch')).toBeNull();
  });
});
