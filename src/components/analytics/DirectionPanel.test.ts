import { describe, expect, it } from 'vitest';
import type { Trade } from '../../types';
import { directionRows } from './DirectionPanel';

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
