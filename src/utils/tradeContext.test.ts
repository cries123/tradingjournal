import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { tradeContext, usualQuantity } from './tradeContext';

let n = 0;
const t = (over: Partial<Trade>): Trade => ({ id: `snaptrade_a_${String(n++).padStart(4, '0')}`, date: '2026-09-17', symbol: 'SPY', pnl: 0, ...over }) as Trade;

describe('tradeContext', () => {
  it('places a trade in its day in the order the rules read it', () => {
    const day = [t({ pnl: 160 }), t({ pnl: -215 }), t({ pnl: -204 }), t({ pnl: 104 }), t({ pnl: -296 })];
    const ctx = tradeContext(day[4], [...day].reverse());
    expect(ctx).toMatchObject({ position: 5, dayCount: 5, dayBefore: -155 });
  });

  it('calls a trade oversized only against a real habit', () => {
    const history = Array.from({ length: 12 }, () => t({ date: '2026-09-01', quantity: 5 }));
    const big = t({ quantity: 8 });
    expect(usualQuantity(history)).toBe(5);
    expect(tradeContext(big, [...history, big]).oversized).toBe(true);
    expect(tradeContext(t({ quantity: 6 }), history).oversized).toBe(false);
  });

  it('has no usual size with too few sized trades to call one', () => {
    const few = Array.from({ length: 4 }, () => t({ quantity: 1 }));
    expect(usualQuantity(few)).toBeNull();
    expect(tradeContext(t({ quantity: 50 }), few).oversized).toBe(false);
  });
});
