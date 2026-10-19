import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { formatCurrency } from './format';
import {
  drawdownFromPeak,
  drawdownHint,
  matchesFilters,
  numberWord,
  ordinalWord,
  partsText,
  periodWords,
  signed,
  signedWhole,
  verdictBand,
  whole,
} from './performanceScreen';
import { performanceVerdict } from './performanceVerdict';
import { simulateRules } from './ruleSimulator';
import { maxDrawdownByDay } from './trackRecord';

const fmt = (n: number) => formatCurrency(n, 'USD');
const NOW = { year: 2026, month: 9 };

let n = 0;
const trade = (over: Partial<Trade>): Trade =>
  ({ id: `snaptrade_acc_${String(n++).padStart(5, '0')}`, date: '2026-08-03', symbol: 'SPY', pnl: 0, assetType: 'option', optionType: 'call', quantity: 1, tradePrice: 2, ...over }) as Trade;

/** SPY that bleeds after the third trade of the day, and CVX shares that win. Same shape as the screen test's. */
function bleedsLate(): Trade[] {
  n = 0;
  const trades: Trade[] = [];
  for (let day = 1; day <= 12; day++) {
    const date = `2026-08-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < 7; i++) {
      const pnl = i >= 3 ? (i % 2 === 0 ? -120 : -60) : i === 1 ? -20 : 45;
      trades.push(trade({ date, pnl, expiration: date, openDate: date, optionType: i % 3 === 0 ? 'put' : 'call' }));
    }
  }
  for (let day = 13; day <= 16; day++) {
    trades.push(trade({ date: `2026-08-${day}`, symbol: 'CVX', assetType: 'stock', pnl: 300, quantity: 50, tradePrice: 150 }));
  }
  return trades;
}

describe('the period, as the sentences need it', () => {
  it('says "this year" only of this year', () => {
    expect(periodWords('year', 2026, 3, NOW)).toEqual({ noun: 'this year', during: 'this year' });
    expect(periodWords('year', 2025, 3, NOW)).toEqual({ noun: '2025', during: 'in 2025' });
  });

  it('says "this month" only of this month, and names any other', () => {
    expect(periodWords('month', 2026, 9, NOW)).toEqual({ noun: 'this month', during: 'this month' });
    expect(periodWords('month', 2026, 8, NOW)).toEqual({ noun: 'September 2026', during: 'in September 2026' });
    // The same month of another year is another month.
    expect(periodWords('month', 2025, 9, NOW).noun).toBe('October 2025');
  });

  it('calls all time the whole journal', () => {
    expect(periodWords('all', 2026, 9, NOW).during).toBe('across your whole journal');
  });
});

describe('figures', () => {
  it('signs P&L and rounds the list figures to the dollar', () => {
    expect(signed(705.33, fmt)).toBe('+$705.33');
    expect(signed(-5689.02, fmt)).toBe('-$5,689.02');
    expect(signed(0, fmt)).toBe('$0.00');
    expect(whole(1554.4, fmt)).toBe('$1,554');
    expect(signedWhole(-5689.02, fmt)).toBe('-$5,689');
    expect(signedWhole(0.4, fmt)).toBe('$0');
  });

  it('spells small counts and ordinals, and falls back to digits', () => {
    expect(numberWord(3)).toBe('three');
    expect(numberWord(14)).toBe('14');
    expect(ordinalWord(4)).toBe('fourth');
    expect(ordinalWord(13)).toBe('13th');
    expect(ordinalWord(21)).toBe('21st');
    expect(ordinalWord(112)).toBe('112th');
  });
});

describe('the filter', () => {
  const t = trade({ symbol: 'SPY', setup: 'ORB', side: 'long', tags: ['Fade'] });
  const none = { symbol: '', setup: '', side: '', tag: '' };

  it('passes everything with nothing set', () => {
    expect(matchesFilters(t, none)).toBe(true);
  });

  it('applies each of the four, as the Overview does', () => {
    expect(matchesFilters(t, { ...none, symbol: 'QQQ' })).toBe(false);
    expect(matchesFilters(t, { ...none, setup: 'Fade' })).toBe(false);
    expect(matchesFilters(t, { ...none, side: 'short' })).toBe(false);
    // A tag matches the setup or any tag on the trade.
    expect(matchesFilters(t, { ...none, tag: 'Fade' })).toBe(true);
    expect(matchesFilters(t, { ...none, tag: 'ORB' })).toBe(true);
    expect(matchesFilters(t, { ...none, tag: 'Gap' })).toBe(false);
  });
});

describe('max drawdown, and where it fell from', () => {
  it('is the track record’s figure, to the cent, whatever order the trades arrive in', () => {
    const journals: Trade[][] = [
      bleedsLate(),
      [trade({ date: '2026-03-02', pnl: 500 }), trade({ date: '2026-03-05', pnl: -800 }), trade({ date: '2026-04-01', pnl: 1200 }), trade({ date: '2026-04-02', pnl: -300 })],
      [...bleedsLate()].reverse(),
      [trade({ date: '2026-01-02', pnl: 10, grossPnl: 15, fees: 5 })],
      // A hand-entered pnl that disagrees with gross less fees: both walks read the net of fees.
      [trade({ date: '2026-02-02', pnl: 100, grossPnl: 100, fees: 30 }), trade({ date: '2026-02-03', pnl: -100, grossPnl: -100, fees: 30 })],
    ];
    for (const trades of journals) {
      expect(drawdownFromPeak(trades).depth).toBeCloseTo(-maxDrawdownByDay(trades), 6);
    }
  });

  it('names the high it fell from, in the words the period needs', () => {
    const trades = [trade({ date: '2026-03-02', pnl: 500 }), trade({ date: '2026-03-05', pnl: -800 }), trade({ date: '2026-04-01', pnl: 1200 })];
    const dd = drawdownFromPeak(trades);
    expect(dd).toEqual({ depth: 800, peakDate: '2026-03-02' });
    expect(drawdownHint(dd, 'year')).toBe('from the March high');
    expect(drawdownHint(dd, 'month')).toBe('from the Mar 2 high');
    expect(drawdownHint(dd, 'all')).toBe('from the March 2026 high');
  });

  it('keeps the high the deepest fall started from, not a later, shallower one', () => {
    const trades = [
      trade({ date: '2026-02-02', pnl: 1000 }),
      trade({ date: '2026-02-03', pnl: -900 }),
      trade({ date: '2026-05-01', pnl: 1500 }),
      trade({ date: '2026-05-02', pnl: -100 }),
    ];
    expect(drawdownFromPeak(trades).peakDate).toBe('2026-02-02');
  });

  it('says when the period fell from where it began, and when it gave nothing back', () => {
    expect(drawdownHint(drawdownFromPeak([trade({ pnl: -50 })]), 'year')).toBe('from where the period began');
    expect(drawdownHint(drawdownFromPeak([trade({ pnl: 50 })]), 'year')).toBe('nothing given back');
  });
});

describe('the verdict band', () => {
  const period = periodWords('year', 2026, 7, NOW);

  it('says what the drain is about without restating its figure, and whether the rest of the day made money', () => {
    const band = verdictBand(bleedsLate(), fmt, period)!;
    expect(band.primary.kind).toBe('drain');
    expect(band.primary.pnl).toBe(-4320);
    expect(band.primary.sentence).toBe('Your 4th and later trades of the day, across 48 trades.');
    expect(band.primary.context).toBe('Everything before them made money.');
  });

  it('does not say the trades before the drain made money when they lost it too', () => {
    n = 0;
    const trades: Trade[] = [];
    // The first three of every day are shares that lose a little; the rest are options across three
    // tickers and both types, so no ticker, type or day size outweighs the 4th-and-later drain.
    const late = [
      { symbol: 'B1', optionType: 'call' as const },
      { symbol: 'B2', optionType: 'put' as const },
      { symbol: 'B3', optionType: 'call' as const },
    ];
    for (let d = 1; d <= 8; d++) {
      const date = `2026-07-${String(d).padStart(2, '0')}`;
      for (const pnl of [-10, -10, 5]) trades.push(trade({ date, pnl, symbol: 'AAA', assetType: 'stock' }));
      for (const leg of late.slice(0, d <= 4 ? 2 : 3)) trades.push(trade({ date, pnl: -60, ...leg }));
    }
    const band = verdictBand(trades, fmt, period)!;
    expect(band.primary.sentence).toBe('Your 4th and later trades of the day, across 20 trades.');
    expect(band.primary.context).toBeNull();
  });

  it('calls the engine the best spot in the day only when it is also the best per trade', () => {
    const band = verdictBand(bleedsLate(), fmt, period)!;
    expect(band.secondary!.sentence).toBe('Your 1st trade of the day, across 16 trades — the best spot in your day.');

    // The 1st trade makes the most in total ($600), but the 3rd makes more a trade ($80 against $30).
    n = 0;
    const trades: Trade[] = [];
    for (let d = 1; d <= 20; d++) {
      const date = `2026-04-${String(d).padStart(2, '0')}`;
      for (const pnl of d <= 5 ? [30, -40, 80] : [30, -40]) trades.push(trade({ date, pnl }));
    }
    const other = verdictBand(trades, fmt, period)!;
    expect(other.secondary!.sentence).toBe('Your 1st trade of the day, across 20 trades.');
  });

  it('names the same cap the verdict does, with the rule simulator’s own figure', () => {
    const trades = bleedsLate();
    const band = verdictBand(trades, fmt, period)!;
    expect(performanceVerdict(trades, fmt)!.change!.text).toContain('Stop after your third trade of the day');
    expect(band.change!.headline).toBe('Stop after three');
    expect(band.change!.cap).toBe(3);
    const simulated = simulateRules(trades, { enabled: true, maxTradesPerDay: 3 }).simulatedPnl;
    expect(partsText(band.change!.detail)).toBe(`The trades before your fourth made ${signed(simulated, fmt)} this year.`);
    expect(partsText(band.change!.phone)).toBe(`Stop after three — the trades before your fourth made ${signed(simulated, fmt)}`);
  });

  it('turns a day-size drain into a cap on the day, with both averages', () => {
    n = 0;
    const trades: Trade[] = [];
    for (let day = 1; day <= 10; day++) trades.push(trade({ date: `2026-05-${String(day).padStart(2, '0')}`, pnl: 100 }));
    for (let day = 11; day <= 20; day++) for (let i = 0; i < 7; i++) trades.push(trade({ date: `2026-05-${day}`, pnl: -10 }));
    const band = verdictBand(trades, fmt, period)!;
    expect(performanceVerdict(trades, fmt)!.change!.dimension).toBe('load');
    expect(band.change!.headline).toBe('Cap the day at five');
    expect(band.change!.cap).toBe(5);
    expect(partsText(band.change!.detail)).toBe('Days with 6–10 trades average -$70.00; days with 1–2 trades average $100.00.');
  });

  it('leads with the engine when nothing lost', () => {
    n = 0;
    const trades = Array.from({ length: 12 }, (_, i) => trade({ date: `2026-06-${String(1 + (i % 4)).padStart(2, '0')}`, pnl: 40 + i }));
    const band = verdictBand(trades, fmt, period);
    expect(band?.primary.kind).toBe('engine');
    expect(band?.secondary).toBeNull();
  });

  it('says nothing for a sample too thin for a verdict', () => {
    expect(verdictBand([trade({ pnl: -50 }), trade({ pnl: 20 })], fmt, period)).toBeNull();
  });
});
