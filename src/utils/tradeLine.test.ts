import { describe, expect, it } from 'vitest';
import { tradeLine } from './tradeLine';

describe('tradeLine', () => {
  it('names an option by its strike and right', () => {
    expect(tradeLine({ symbol: 'SPY', optionType: 'call', strike: 560 }).title).toBe('SPY 560C');
    expect(tradeLine({ symbol: 'SPY', optionType: 'put', strike: 557.5 }).title).toBe('SPY 557.5P');
  });

  it('tags a same-day expiry 0DTE, counted from the open', () => {
    expect(tradeLine({ symbol: 'SPY', optionType: 'call', strike: 560, date: '2026-09-28', expiration: '2026-09-28' }).expiry).toBe('0DTE');
    // Opened Monday, closed Friday on its expiry: it was a 4DTE when it was bought.
    expect(
      tradeLine({ symbol: 'SPY', optionType: 'call', strike: 560, openDate: '2026-09-21', date: '2026-09-25', expiration: '2026-09-25' }).expiry,
    ).toBe('4DTE');
  });

  it('leaves far-dated and expiry-less contracts untagged', () => {
    expect(tradeLine({ symbol: 'SPY', optionType: 'call', strike: 560, date: '2026-09-01', expiration: '2026-12-18' }).expiry).toBeNull();
    expect(tradeLine({ symbol: 'SPY', optionType: 'call', strike: 560, date: '2026-09-01' }).expiry).toBeNull();
  });

  it('shows shares by symbol alone', () => {
    expect(tradeLine({ symbol: 'CVX', assetType: 'stock', side: 'long' })).toEqual({ title: 'CVX', dated: 'CVX', expiry: null, kind: 'other', side: 'Long' });
  });

  it('puts the expiry date in the long form', () => {
    expect(tradeLine({ symbol: 'SPY', optionType: 'call', strike: 560, expiration: '2026-09-28' }).dated).toBe('SPY 28 Sep 560C');
    expect(tradeLine({ symbol: 'SPY', optionType: 'put', strike: 560 }).dated).toBe('SPY 560P');
  });

  it('does not invent a strike for an option that has none', () => {
    expect(tradeLine({ symbol: 'SPY', optionType: 'put' }).title).toBe('SPY');
  });
});
