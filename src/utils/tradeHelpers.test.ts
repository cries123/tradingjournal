import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { effectivePnl, holdTimeMinutes, marketSessionFromTime } from './tradeHelpers';

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

  it('treats pnl as gross when fees are set without a grossPnl', () => {
    // Documents a real ambiguity rather than endorsing it: this branch only runs for hand-entered
    // trades, where nothing says whether the typed pnl was before or after costs. The code assumes
    // before. A user who types the figure their broker already netted is charged the fees twice.
    expect(effectivePnl(trade({ pnl: 100, fees: 7 }))).toBe(93);
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
