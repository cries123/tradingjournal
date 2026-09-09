import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { APPROACHING_FRACTION, ruleStandingToday } from './ruleStanding';

let counter = 0;
const trade = (pnl: number, date = '2026-08-10'): Trade =>
  ({ id: `t${counter++}`, date, symbol: 'SPY', pnl }) as Trade;

const rules = (over: Partial<TradingRules> = {}): TradingRules => ({
  enabled: true,
  maxDailyLoss: 500,
  maxTradesPerDay: 4,
  ...over,
});

const TODAY = '2026-08-10';

describe('ruleStandingToday', () => {
  it('says nothing when the trader never turned rules on', () => {
    expect(ruleStandingToday([trade(-9999)], rules({ enabled: false }), TODAY)).toBeNull();
  });

  it('says nothing on a day with no trades', () => {
    // A green all-clear every morning is how a warning becomes wallpaper.
    expect(ruleStandingToday([trade(-100, '2026-08-09')], rules(), TODAY)).toBeNull();
  });

  it('only ever looks at today', () => {
    const standing = ruleStandingToday(
      [trade(-1000, '2026-08-09'), trade(-50, TODAY)],
      rules(),
      TODAY,
    );
    expect(standing!.dayPnl).toBe(-50);
    expect(standing!.tradeCount).toBe(1);
    expect(standing!.level).toBe('clear');
  });

  it('warns at one trade from the cap, and again on the last allowed one', () => {
    const three = [trade(1), trade(1), trade(1)];
    expect(ruleStandingToday(three, rules(), TODAY)!.warnings[0].message).toContain('One trade left');

    const four = [...three, trade(1)];
    const atCap = ruleStandingToday(four, rules(), TODAY)!;
    expect(atCap.level).toBe('approaching');
    expect(atCap.warnings[0].message).toContain('breaks your own limit');
  });

  it('breaches once the cap is actually passed', () => {
    const five = Array.from({ length: 5 }, () => trade(1));
    const standing = ruleStandingToday(five, rules(), TODAY)!;
    expect(standing.level).toBe('breached');
    expect(standing.breaches.map((b) => b.type)).toContain('max_trades');
  });

  it('warns before the daily stop, not after it', () => {
    const limit = 500;
    const near = ruleStandingToday([trade(-limit * APPROACHING_FRACTION)], rules(), TODAY)!;
    expect(near.level).toBe('approaching');
    expect(near.warnings.some((w) => w.type === 'max_loss')).toBe(true);

    const notYet = ruleStandingToday([trade(-limit * (APPROACHING_FRACTION - 0.1))], rules(), TODAY)!;
    expect(notYet.level).toBe('clear');
  });

  it('stops warning about a limit once that limit is broken', () => {
    // A warning that "you are 140% of the way to your stop" alongside the breach is two sentences
    // about the same fact, and the second one is nonsense.
    const standing = ruleStandingToday([trade(-900)], rules(), TODAY)!;
    expect(standing.level).toBe('breached');
    expect(standing.warnings.some((w) => w.type === 'max_loss')).toBe(false);
  });

  it('still warns about a different limit while one is broken', () => {
    // Somebody who blew the loss cap and is one trade from the trade cap needs the second
    // sentence — it is the one that names the next action.
    const trades = [trade(-900), trade(0), trade(0)];
    const standing = ruleStandingToday(trades, rules({ maxTradesPerDay: 4 }), TODAY)!;
    expect(standing.breaches.some((b) => b.type === 'max_loss')).toBe(true);
    expect(standing.warnings.some((w) => w.type === 'max_trades')).toBe(true);
  });

  it('reads a positive limit written as a negative number', () => {
    // The settings field has accepted both, and a "-500" stop must not become a limit of minus
    // five hundred that nothing can ever cross.
    const standing = ruleStandingToday([trade(-450)], rules({ maxDailyLoss: -500 }), TODAY)!;
    expect(standing.level).toBe('approaching');
  });

  it('warns as a winning day approaches the target the trader set', () => {
    const standing = ruleStandingToday(
      [trade(850)],
      rules({ maxDailyGain: 1000, maxTradesPerDay: undefined }),
      TODAY,
    )!;
    expect(standing.warnings.some((w) => w.type === 'max_gain')).toBe(true);
  });

  it('reads P&L net of fees', () => {
    const standing = ruleStandingToday(
      [{ ...trade(0), grossPnl: -350, fees: 60, pnl: -410 } as Trade],
      rules({ maxTradesPerDay: undefined }),
      TODAY,
    )!;
    expect(standing.dayPnl).toBe(-410);
    expect(standing.level).toBe('approaching');
  });
});
