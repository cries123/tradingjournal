import { afterEach, describe, expect, it } from 'vitest';
import {
  aggregateBars,
  chartedUnderlying,
  contractLabel,
  isTradingDay,
  latestReplayDay,
  nextTradingDay,
  optionRoots,
  osiSymbol,
  pickContract,
  possibleFillTimes,
  replayAvailable,
  replayAvailableAt,
  sessionWindow,
  vwapLine,
  type Bar,
} from './marketReplay';

const bar = (time: number, open: number, high: number, low: number, close: number, volume = 100): Bar => ({ time, open, high, low, close, volume });

describe('contract symbols', () => {
  it('builds the 21-character OSI symbol Databento and OPRA use', () => {
    expect(osiSymbol('SPY', '2026-10-16', 'C', 560)).toBe('SPY   261016C00560000');
    expect(osiSymbol('SPXW', '2026-10-16', 'P', 5800)).toBe('SPXW  261016P05800000');
    expect(osiSymbol('SPY', '2026-10-16', 'C', 562.5)).toBe('SPY   261016C00562500');
    expect(osiSymbol('SPY', '2026-10-16', 'C', 0)).toBeNull();
    expect(osiSymbol('SPY', '10/16/2026', 'C', 560)).toBeNull();
    expect(osiSymbol('spy', '2026-10-16', 'C', 560)).toBeNull();
  });

  it('asks for an SPX option under SPXW first, then SPX, and leaves SPY alone', () => {
    expect(optionRoots('SPX')).toEqual(['SPXW', 'SPX']);
    expect(optionRoots('spy')).toEqual(['SPY']);
  });

  it('draws SPY for SPX and says so, and draws nothing for VIX', () => {
    expect(chartedUnderlying('SPX')).toEqual({ symbol: 'SPY', proxyFor: 'SPX' });
    expect(chartedUnderlying('SPXW')).toEqual({ symbol: 'SPY', proxyFor: 'SPX' });
    expect(chartedUnderlying('AAPL')).toEqual({ symbol: 'AAPL', proxyFor: null });
    expect(chartedUnderlying('VIX')).toBeNull();
  });

  it('names a contract the way the trade log does', () => {
    expect(contractLabel('SPXW  261016P05800000')).toBe('SPXW 16 Oct 5800P');
    expect(contractLabel('SPY   261016C00562500')).toBe('SPY 16 Oct 562.5C');
  });

  it('tells SPXW from SPX by which one traded at the trader’s prices', () => {
    const spxw = { osi: 'SPXW  261016C05800000', bars: [bar(1, 4, 4.5, 3.8, 4.2)] };
    const spx = { osi: 'SPX   261016C05800000', bars: [bar(1, 9, 9.5, 8.8, 9.1)] };
    expect(pickContract([spxw, spx], [9.2])).toBe(spx.osi);
    expect(pickContract([spxw, spx], [4.1])).toBe(spxw.osi);
    // Nothing to match: the likelier root, as long as it traded at all.
    expect(pickContract([spxw, spx], [])).toBe(spxw.osi);
    expect(pickContract([{ ...spxw, bars: [] }, spx], [])).toBe(spx.osi);
    expect(pickContract([{ ...spxw, bars: [] }], [4.1])).toBeNull();
  });
});

describe('the market calendar', () => {
  it('knows weekends and exchange holidays', () => {
    expect(isTradingDay('2026-10-16')).toBe(true);
    expect(isTradingDay('2026-10-17')).toBe(false);
    expect(isTradingDay('2026-11-26')).toBe(false); // Thanksgiving
    expect(isTradingDay('2025-01-09')).toBe(false); // the day of mourning
    expect(nextTradingDay('2026-01-16')).toBe('2026-01-20'); // over MLK Day
  });

  it('draws the session 9:30 to 4:15 New York time, summer and winter', () => {
    expect(sessionWindow('2026-10-16').start.toISOString()).toBe('2026-10-16T13:30:00.000Z');
    expect(sessionWindow('2026-10-16').end.toISOString()).toBe('2026-10-16T20:15:00.000Z');
    expect(sessionWindow('2026-12-04').start.toISOString()).toBe('2026-12-04T14:30:00.000Z');
  });
});

/*
 * When a day may be shown. OPRA charges for options data until it is a full trading day old, and
 * Databento's terms allow showing a dataset externally after 24 hours: the later of the two.
 */
describe('when a day opens for replay', () => {
  const TZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = TZ;
  });

  it('opens a Monday on Tuesday after the close, and a Friday on Monday at the open, in any time zone', () => {
    // The test machine's clock must not decide it: a DST bug once survived here because CI is UTC.
    for (const tz of ['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      expect(replayAvailableAt('2026-10-12').toISOString(), tz).toBe('2026-10-13T20:15:00.000Z');
      expect(replayAvailableAt('2026-10-16').toISOString(), tz).toBe('2026-10-19T13:30:00.000Z');
      expect(replayAvailableAt('2026-01-16').toISOString(), tz).toBe('2026-01-20T14:30:00.000Z');
      expect(replayAvailableAt('2026-11-25').toISOString(), tz).toBe('2026-11-27T14:30:00.000Z');
    }
  });

  it('is closed a second before and open at the moment', () => {
    const at = replayAvailableAt('2026-10-16').getTime();
    expect(replayAvailable('2026-10-16', new Date(at - 1000))).toBe(false);
    expect(replayAvailable('2026-10-16', new Date(at))).toBe(true);
    expect(replayAvailable('2026-10-17', new Date(at + 864e5))).toBe(false); // a Saturday never opens
  });

  it('finds the newest day that can be replayed now', () => {
    // Tuesday morning: Monday is not 24 hours past its close yet, so Friday is the latest.
    expect(latestReplayDay(new Date('2026-10-20T14:00:00Z'))).toBe('2026-10-16');
    expect(latestReplayDay(new Date('2026-10-20T21:00:00Z'))).toBe('2026-10-19');
  });
});

describe('bars on screen', () => {
  const minute = (i: number) => 1_792_000_000 + i * 60;
  it('rolls minutes up into aligned candles', () => {
    const bars = [0, 1, 2, 3, 4, 5].map((i) => bar(minute(i), 10 + i, 11 + i, 9 + i, 10.5 + i, 10));
    const five = aggregateBars(bars, 5);
    const bucket = Math.floor(minute(0) / 300) * 300;
    expect(five[0]).toMatchObject({ time: bucket, open: 10, low: 9 });
    expect(five.reduce((s, b) => s + b.volume, 0)).toBe(60);
    expect(aggregateBars(bars, 1)).toBe(bars);
  });

  it('weights VWAP by volume', () => {
    const v = vwapLine([bar(1, 10, 10, 10, 10, 100), bar(2, 20, 20, 20, 20, 300)]);
    expect(v[1].value).toBe(17.5);
    expect(vwapLine([bar(1, 10, 10, 10, 10, 0)])).toEqual([]);
  });

  it('finds the minutes a fill price traded through, and nothing without a price', () => {
    const bars = [bar(60, 1, 1.2, 0.9, 1.1), bar(120, 1.1, 1.5, 1.05, 1.4), bar(180, 1.4, 1.45, 1.3, 1.35)];
    expect(possibleFillTimes(bars, 1.36)).toEqual([120, 180]);
    expect(possibleFillTimes(bars, undefined)).toEqual([]);
  });
});
