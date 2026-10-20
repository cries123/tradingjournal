import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { Bar } from './marketReplay';
import { replayPlan } from './replayTrades';
import { actualFills, cursorForCandle, estimatedFillTimes, markPrice, nextCursor, suggestedStrike } from './replayView';
import { easternClock, tradeMinute } from './replayClock';

const trade = (over: Partial<Trade>): Trade => ({ id: Math.random().toString(36).slice(2), date: '2026-10-16', symbol: 'SPX', pnl: 0, ...over }) as Trade;
const option = (over: Partial<Trade>) => trade({ assetType: 'option', optionType: 'call', expiration: '2026-10-16', strike: 5800, ...over });

describe('what a day asks the server for', () => {
  it('one contract per distinct option, with every fill price on it', () => {
    const a = option({ id: 'a', tradePrice: 4.1, exitPrice: 5 });
    const b = option({ id: 'b', tradePrice: 4.1, exitPrice: 3.2 });
    const c = option({ id: 'c', optionType: 'put', strike: 5790, tradePrice: 2 });
    const plan = replayPlan([a, b, c]);
    expect(plan.contracts).toEqual([
      { underlying: 'SPX', expiration: '2026-10-16', right: 'C', strike: 5800, fills: [4.1, 5, 3.2] },
      { underlying: 'SPX', expiration: '2026-10-16', right: 'P', strike: 5790, fills: [2] },
    ]);
    expect(plan.tradeContract.get('b')).toBe(0);
    expect(plan.underlying).toBe('SPX');
  });

  it('leaves out a trade it cannot turn into a contract rather than guessing', () => {
    const shares = trade({ id: 's', symbol: 'SPY', assetType: 'stock' });
    const vague = option({ id: 'v', strike: undefined });
    const plan = replayPlan([shares, vague]);
    expect(plan.contracts).toEqual([]);
    expect(plan.tradeContract.get('s')).toBeNull();
    expect(plan.tradeContract.get('v')).toBeNull();
  });
});

describe('the replay clock', () => {
  it('starts on the last minute of the clicked candle, so the candle is drawn whole', () => {
    expect(cursorForCandle(1000, 5)).toBe(1240);
    expect(cursorForCandle(1000, 1)).toBe(1000);
  });

  it('steps a candle at a time and stops at the close', () => {
    expect(nextCursor(1000, 5, 2000)).toBe(1300);
    expect(nextCursor(1800, 5, 2000)).toBeNull();
  });

  it('fills practice trades at the last close the replay has shown, never a later one', () => {
    const bars: Bar[] = [60, 120, 180].map((t, i) => ({ time: t, open: 1, high: 2, low: 0.5, close: 1 + i, volume: 1 }));
    expect(markPrice(bars, 130)).toBe(2);
    expect(markPrice(bars, null)).toBe(3);
    expect(markPrice(bars, 10)).toBeNull();
  });

  it('reads New York time, and turns a recorded trade time into its minute', () => {
    const at = tradeMinute('2026-10-16', '09:42:15');
    expect(at).toBe(Date.parse('2026-10-16T13:42:00Z') / 1000);
    expect(easternClock(at!)).toBe('09:42');
    expect(tradeMinute('2026-10-16', undefined)).toBeNull();
  });
});

describe('the trader’s real fills on the replay', () => {
  it('marks timed fills, buy and sell the right way round, and never past the cursor', () => {
    const long = option({ entryTime: '09:42:00', exitTime: '10:05:00', tradePrice: 4, exitPrice: 5 });
    const short = option({ side: 'short', entryTime: '11:00:00', tradePrice: 3 });
    const all = actualFills([long, short], '2026-10-16', null);
    expect(all.map((f) => f.side)).toEqual(['buy', 'sell', 'sell']);
    const early = actualFills([long], '2026-10-16', Date.parse('2026-10-16T13:50:00Z') / 1000);
    expect(early).toHaveLength(1);
  });

  it('shades only the untimed fills, bucketed to the timeframe, as an estimate', () => {
    const minute = (m: number) => Date.parse('2026-10-16T13:30:00Z') / 1000 + m * 60;
    const bars: Bar[] = [0, 1, 2, 6].map((m) => ({ time: minute(m), open: 4, high: m === 6 ? 5.2 : 4.3, low: 3.9, close: 4.1, volume: 1 }));
    const untimed = option({ tradePrice: 4.2, exitPrice: 5.1 });
    const timed = option({ entryTime: '09:31:00', tradePrice: 4.2 });
    expect(estimatedFillTimes([untimed, timed], bars, 1, null)).toEqual([minute(0), minute(1), minute(2), minute(6)]);
    expect(estimatedFillTimes([untimed], bars, 5, null)).toEqual([minute(0), minute(5)]);
    expect(estimatedFillTimes([timed], bars, 1, null)).toEqual([]);
    expect(estimatedFillTimes([untimed], bars, 1, minute(1))).toEqual([minute(0), minute(1)]);
  });
});

describe('the contract picker', () => {
  it('starts SPX at the money from SPY, on SPX’s five-point strikes', () => {
    expect(suggestedStrike(581.37, 'SPX')).toBe(5815);
    expect(suggestedStrike(581.37, 'SPY')).toBe(581);
    expect(suggestedStrike(null, 'SPY')).toBeNull();
  });
});
