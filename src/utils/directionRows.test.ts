import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { directionRows, directionSplit } from './directionRows';

const trade = (side: 'long' | 'short' | undefined, pnl: number, over: Partial<Trade> = {}): Trade =>
  ({ id: `${side}-${pnl}`, date: '2026-08-03', symbol: 'SPY', side, pnl, ...over }) as Trade;

describe('directionRows', () => {
  it('splits P&L, count and win rate by direction', () => {
    const rows = directionRows([
      trade('long', 100),
      trade('long', -40),
      trade('long', 60),
      trade('short', -30),
    ]);
    const [long, short] = rows;

    expect(long.pnl).toBe(120);
    expect(long.trades).toBe(3);
    expect(long.winRate).toBeCloseTo((2 / 3) * 100, 6);
    expect(short.pnl).toBe(-30);
    expect(short.trades).toBe(1);
    expect(short.winRate).toBe(0);
  });

  it('returns both directions even when one was never traded', () => {
    // The panel renders an untraded direction dimmed rather than hiding it, so the row has to
    // exist. Dropping it would also make the two cards different heights month to month.
    const rows = directionRows([trade('long', 100)]);
    expect(rows.map((r) => r.side)).toEqual(['long', 'short']);
    expect(rows[1]).toMatchObject({ trades: 0, pnl: 0, winRate: 0 });
  });

  it('reports zero rather than NaN for a direction with no trades', () => {
    const rows = directionRows([]);
    expect(rows.every((r) => Number.isFinite(r.winRate) && Number.isFinite(r.pnl))).toBe(true);
  });

  it('ignores trades that carry no direction', () => {
    // Side is optional on a Trade. An entry without one belongs to neither bucket — quietly
    // counting it as long would overstate whichever side the user actually favours.
    const rows = directionRows([trade(undefined, 500), trade('long', 100)]);
    expect(rows[0].pnl).toBe(100);
    expect(rows[0].trades).toBe(1);
    expect(rows[1].trades).toBe(0);
  });

  it('counts fees against the direction that paid them', () => {
    // Uses effectivePnl, so a trade whose gross and fees are both known nets out here the same way
    // it does everywhere else.
    const rows = directionRows([trade('long', 90, { grossPnl: 100, fees: 10 })]);
    expect(rows[0].pnl).toBe(90);
  });

  it('does not count a breakeven trade as a win', () => {
    const rows = directionRows([trade('long', 0), trade('long', 100)]);
    expect(rows[0].winRate).toBe(50);
  });
});

describe('directionSplit', () => {
  const option = (optionType: 'call' | 'put' | undefined, pnl: number, side: 'long' | 'short' = 'long') =>
    trade(side, pnl, { id: `${optionType}-${pnl}-${side}`, assetType: 'option', optionType });
  const share = (pnl: number) => trade('long', pnl, { id: `stock-${pnl}`, assetType: 'stock' });

  it('splits an options trader who never sells short into calls and puts', () => {
    // Every one of these is "long", so long vs short would be one full bar and one empty one.
    const split = directionSplit([option('call', 100), option('call', -40), option('put', -30)]);
    expect(split.title).toBe('Calls vs Puts');
    expect(split.groups.map((g) => g.label)).toEqual(['Calls', 'Puts']);
    expect(split.groups[0]).toMatchObject({ pnl: 60, trades: 2, winRate: 50 });
    expect(split.groups[1]).toMatchObject({ pnl: -30, trades: 1, winRate: 0 });
  });

  it('keeps both option groups when only one was traded, as the long/short card does', () => {
    const split = directionSplit([option('call', 100)]);
    expect(split.groups.map((g) => g.key)).toEqual(['call', 'put']);
    expect(split.groups[1]).toMatchObject({ trades: 0, pnl: 0 });
  });

  it('adds shares as a third group only when shares were traded', () => {
    const split = directionSplit([option('call', 100), option('put', 20), share(-15)]);
    expect(split.title).toBe('Calls, puts and shares');
    expect(split.groups.map((g) => g.label)).toEqual(['Calls', 'Puts', 'Shares']);
    expect(split.groups[2]).toMatchObject({ pnl: -15, trades: 1 });
  });

  it('stays long vs short as soon as anything was sold short', () => {
    // A short call is a bet the other way from a long one. Filing both under "Calls" would hide
    // the very thing a trader who sells premium wants to see.
    const split = directionSplit([option('call', 100), option('call', 50, 'short')]);
    expect(split.title).toBe('Long vs Short');
    expect(split.groups.map((g) => g.key)).toEqual(['long', 'short']);
    expect(split.groups[1]).toMatchObject({ pnl: 50, trades: 1 });
  });

  it('stays long vs short for a journal with no options in it', () => {
    const split = directionSplit([share(100), share(-20)]);
    expect(split.title).toBe('Long vs Short');
    expect(split.groups[0]).toMatchObject({ pnl: 80, trades: 2 });
  });

  it('leaves out an option with no call or put recorded rather than guessing', () => {
    const split = directionSplit([option('call', 100), option(undefined, 900)]);
    expect(split.groups.reduce((n, g) => n + g.trades, 0)).toBe(1);
    expect(split.groups[0].pnl).toBe(100);
  });
});
