import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { Bar } from './marketReplay';
import {
  afterExit,
  afterExitView,
  bracketTrade,
  excursion,
  measureTrades,
  placeTrade,
  summarizeBrackets,
  withMeasuredExcursions,
} from './tradePath';
import { expand, pathItemFor, pathKey } from './tradePathBars';

/* A trade laid over its contract's minute bars, against figures worked out by hand. */

const OPEN = Date.parse('2026-10-16T13:30:00Z') / 1000; // 09:30 Eastern
/** One bar a minute from the open: [high, low, close] each. */
const day = (rows: [number, number, number][]): Bar[] =>
  rows.map(([high, low, close], i) => ({ time: OPEN + i * 60, open: close, high, low, close, volume: 1 }));

//                09:30            09:31            09:32            09:33            09:34            09:35
const bars = day([[1.1, 0.9, 1.0], [1.3, 1.0, 1.2], [1.5, 1.1, 1.4], [1.4, 0.8, 0.9], [2.2, 0.9, 2.0], [2.1, 1.6, 1.7]]);

const trade = (over: Partial<Trade> = {}): Trade =>
  ({
    id: 't1',
    date: '2026-10-16',
    symbol: 'SPY',
    assetType: 'option',
    optionType: 'call',
    strike: 580,
    expiration: '2026-10-16',
    side: 'long',
    quantity: 2,
    tradePrice: 1.2,
    exitPrice: 1.4,
    pnl: 40,
    ...over,
  }) as Trade;

describe('placing a trade on its bars', () => {
  it('uses the broker’s times when it sent them', () => {
    expect(placeTrade(trade({ entryTime: '09:31:20', exitTime: '09:34' }), bars)).toEqual({ entry: 1, exit: 4, estimated: false });
  });

  it('places an untimed trade at the first minute each price traded, the exit after the entry, and says so', () => {
    // 1.20 first trades at 09:31; 1.40 first trades at or after that at 09:32.
    expect(placeTrade(trade(), bars)).toEqual({ entry: 1, exit: 2, estimated: true });
  });

  it('never places the exit before the entry, even where the exit price traded earlier', () => {
    // 1.45 first trades at 09:32; 1.00 traded at 09:30 and 09:31 too, but the exit is the first after: 09:33.
    expect(placeTrade(trade({ tradePrice: 1.45, exitPrice: 1.0 }), bars)).toEqual({ entry: 2, exit: 3, estimated: true });
  });

  it('refuses to place a trade whose price never traded, or one carried overnight', () => {
    expect(placeTrade(trade({ tradePrice: 5 }), bars)).toBeNull();
    expect(placeTrade(trade({ openDate: '2026-10-15' }), bars)).toBeNull();
    expect(placeTrade(trade(), [])).toBeNull();
  });
});

describe('what the bars say about the trade', () => {
  const timed = trade({ entryTime: '09:31', exitTime: '09:33' });

  it('measures the heat and the peak while it was open, in dollars', () => {
    // Open 09:31–09:33: best high 1.5, worst low 0.8; entry 1.2, two contracts of 100.
    const p = placeTrade(timed, bars)!;
    const ex = excursion(timed, bars, p)!;
    expect(ex.mfe).toBeCloseTo((1.5 - 1.2) * 200, 9);
    expect(ex.mae).toBeCloseTo((1.2 - 0.8) * 200, 9);
  });

  it('turns the excursions round for a short', () => {
    const short = trade({ side: 'short', entryTime: '09:31', exitTime: '09:33' });
    const ex = excursion(short, bars, placeTrade(short, bars)!)!;
    expect(ex.mfe).toBeCloseTo((1.2 - 0.8) * 200, 9);
    expect(ex.mae).toBeCloseTo((1.5 - 1.2) * 200, 9);
  });

  it('says what the contract did after the close, and what holding to the close would have done', () => {
    // Closed 09:33 at 1.40; afterwards high 2.2, low 0.9, last close 1.7.
    const closedAt = trade({ entryTime: '09:31', exitTime: '09:33' });
    const after = afterExit(closedAt, bars, placeTrade(closedAt, bars)!)!;
    expect(after.more).toBeCloseTo((2.2 - 1.4) * 200, 9);
    expect(after.avoided).toBeCloseTo((1.4 - 0.9) * 200, 9);
    expect(after.toClose).toBeCloseTo((1.7 - 1.4) * 200, 9);
    expect(after).toMatchObject({ bestPrice: 2.2, worstPrice: 0.9, closePrice: 1.7 });
  });

  it('has no "after" for a trade closed in the last minute', () => {
    const late = trade({ entryTime: '09:31', exitTime: '09:35' });
    expect(afterExit(late, bars, placeTrade(late, bars)!)).toBeNull();
    expect(afterExitView(late, bars, false)).toEqual({ state: 'end-of-day' });
  });

  it('tells the panel why there is nothing to show', () => {
    expect(afterExitView(trade(), null, false)).toEqual({ state: 'not-stored' });
    expect(afterExitView(trade(), undefined, true)).toEqual({ state: 'loading' });
    expect(afterExitView(trade(), undefined, false)).toBeNull();
    expect(afterExitView(trade({ tradePrice: 9 }), bars, false)).toEqual({ state: 'unplaced' });
    expect(afterExitView(trade(), bars, false)).toMatchObject({ state: 'measured', estimated: true });
  });
});

describe('a stop and a target on real prices', () => {
  // Entry 1.20 at 09:31, really closed 09:34 at 2.00 (+$160 on two contracts).
  const held = trade({ entryTime: '09:31', exitTime: '09:34', exitPrice: 2.0, pnl: 160 });
  const p = () => placeTrade(held, bars)!;

  it('stops out at the stop price when the stop is touched first', () => {
    // A 25% stop is 0.90; 09:33 trades down to 0.80 before any 100% target.
    const r = bracketTrade(held, bars, p(), { stop: 0.25, target: 1 })!;
    expect(r.how).toBe('stop');
    expect(r.exitPrice).toBeCloseTo(0.9, 9);
    expect(r.pnl).toBeCloseTo(160 + (0.9 - 2.0) * 200, 9);
  });

  it('takes the target when it comes first', () => {
    // A 20% target is 1.44; 09:32 reaches 1.50.
    const r = bracketTrade(held, bars, p(), { stop: 0.5, target: 0.2 })!;
    expect(r.how).toBe('target');
    expect(r.pnl).toBeCloseTo(160 + (1.44 - 2.0) * 200, 9);
  });

  it('assumes the stop when one minute touches both levels', () => {
    // Entry 1.10 at 09:32, so a 20% stop is 0.88 and a 20% target 1.32. The first minute searched,
    // 09:33, spans 0.80–1.40 and touches both.
    const wide = trade({ entryTime: '09:32', exitTime: '09:34', tradePrice: 1.1, exitPrice: 2.0, pnl: 180 });
    const r = bracketTrade(wide, bars, placeTrade(wide, bars)!, { stop: 0.2, target: 0.2 })!;
    expect(r.how).toBe('stop');
  });

  it('does not look inside the entry’s own minute, and closes as traded when nothing is touched', () => {
    // 09:31's own low of 1.00 is under a 10% stop (1.08) but came before the fill could be known.
    const quiet = trade({ entryTime: '09:31', exitTime: '09:32', exitPrice: 1.4, pnl: 40 });
    const r = bracketTrade(quiet, bars, placeTrade(quiet, bars)!, { stop: 0.1, target: null })!;
    expect(r.how).toBe('as-traded');
    expect(r.pnl).toBe(40);
  });

  it('adds up what a rule did across trades', () => {
    const rows = [
      { trade: held, result: bracketTrade(held, bars, p(), { stop: 0.25, target: null })!, estimated: false },
      { trade: trade({ id: 't2', pnl: 40 }), result: { how: 'as-traded' as const, exitPrice: 1.4, pnl: 40 }, estimated: true },
    ];
    const s = summarizeBrackets(rows);
    expect(s).toMatchObject({ tested: 2, estimated: 1, stopped: 1, targeted: 0, actualNet: 200 });
    expect(s.ruleNet).toBeCloseTo(160 + (0.9 - 2.0) * 200 + 40, 9);
  });
});

describe('measuring a period', () => {
  it('fills measured MAE and MFE only where the trader recorded none', () => {
    const typed = trade({ id: 'a', mae: 15, mfe: 99 });
    const blank = trade({ id: 'b' });
    const measured = new Map([
      ['a', { mae: 1, mfe: 2 }],
      ['b', { mae: 3, mfe: 4 }],
    ]);
    const { trades, filled } = withMeasuredExcursions([typed, blank], measured);
    expect(trades[0]).toBe(typed);
    expect(trades[1]).toMatchObject({ mae: 3, mfe: 4 });
    expect(filled).toBe(1);
  });

  it('counts the trades on days never opened, and the ones placed by estimate', () => {
    const stored = trade({ id: 's' });
    const missing = trade({ id: 'm', date: '2026-10-15' });
    const m = measureTrades([stored, missing], (t) => (t.id === 's' ? bars : null));
    expect(m.placed.map((p) => p.trade.id)).toEqual(['s']);
    expect(m.notStored).toBe(1);
    expect(m.estimated).toBe(1);
    expect(m.excursions.get('s')).toBeDefined();
  });
});

describe('what a trade asks the server for', () => {
  it('asks once per contract-day, whatever the fills', () => {
    const a = pathItemFor(trade({ tradePrice: 1.2 }))!;
    const b = pathItemFor(trade({ id: 't9', tradePrice: 3.3, exitPrice: 3.1 }))!;
    expect(a).toMatchObject({ kind: 'option', underlying: 'SPY', right: 'C', strike: 580, expiration: '2026-10-16' });
    expect(pathKey(a)).toBe(pathKey(b));
  });

  it('asks for a stock’s own bars, and nothing for what cannot be measured', () => {
    expect(pathItemFor(trade({ assetType: 'stock', optionType: undefined, symbol: 'cvx' }))).toEqual({ kind: 'stock', date: '2026-10-16', symbol: 'CVX' });
    expect(pathItemFor(trade({ exitPrice: undefined }))).toBeNull();
    expect(pathItemFor(trade({ openDate: '2026-10-14' }))).toBeNull();
    expect(pathItemFor(trade({ strike: undefined }))).toBeNull();
  });

  it('rebuilds the bars it is sent', () => {
    const back = expand({ t0: OPEN, m: [0, 2], h: [1.1, 1.5], l: [0.9, 1.1], c: [1.0, 1.4] });
    expect(back.map((b) => [b.time, b.high, b.low, b.close])).toEqual([
      [OPEN, 1.1, 0.9, 1.0],
      [OPEN + 120, 1.5, 1.1, 1.4],
    ]);
  });
});
