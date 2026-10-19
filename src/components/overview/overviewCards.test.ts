import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Trade } from '../../types';
import { toDateKey } from '../../utils/format';

/*
 * The Overview's new cards, painted with the contexts mocked: Today against the trader's limits,
 * what is costing them, and the trade log. What each must never do is the point — Today must not
 * judge two journals against one journal's limits, the costing card must not give away the
 * Performance screen's analysis on a plan without it, and the log must show a day in the order the
 * rules read it.
 */

const state = {
  rules: { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500, maxConsecutiveLosses: 3 } as Record<string, unknown>,
  viewingAll: false,
  unlocked: true,
  accounts: [{ id: 'default', name: 'Primary journal' }, { id: 'paper', name: 'Paper account' }],
  canViewAll: true,
};

vi.mock('../../context/useSettings', () => ({
  useSettings: () => ({
    settings: { currency: 'USD', tradingRules: state.rules, accounts: state.accounts, activeAccountId: 'default' },
    viewingAllJournals: state.viewingAll,
    canViewAllJournals: state.canViewAll,
    setActiveAccount: () => undefined,
    setViewAllJournals: () => undefined,
  }),
}));
vi.mock('../../context/useEntitlement', () => ({
  useEntitlement: () => ({ has: () => state.unlocked }),
}));

const { TodayCard } = await import('./TodayCard');
const { CostingCard } = await import('./CostingCard');
const { TradeLog } = await import('./TradeLog');
const { PhoneJournalSelect } = await import('./PhoneJournalSelect');

const paint = (el: Parameters<typeof renderToString>[0]) =>
  renderToString(el).replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

let n = 0;
const trade = (over: Partial<Trade>): Trade => ({ id: `snaptrade_a_${String(n++).padStart(4, '0')}`, date: '2026-09-17', symbol: 'SPY', pnl: 0, ...over }) as Trade;
const today = toDateKey(new Date());

beforeEach(() => {
  state.rules = { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500, maxConsecutiveLosses: 3 };
  state.viewingAll = false;
  state.unlocked = true;
  state.accounts = [{ id: 'default', name: 'Primary journal' }, { id: 'paper', name: 'Paper account' }];
});

describe('TodayCard', () => {
  it('gauges each limit the trader set against today', () => {
    const html = paint(createElement(TodayCard, { trades: [trade({ date: today, pnl: -420 }), trade({ date: today, pnl: 20 })] }));
    expect(html).toContain('2 of 3 used');
    expect(html).toContain('$100 left');
    expect(html).toContain('Losers in a row');
  });

  it('asks for limits once, instead of drawing empty gauges, when none are set', () => {
    state.rules = { enabled: false };
    const html = paint(createElement(TodayCard, { trades: [], onSetRules: () => undefined }));
    expect(html).toContain('Set your limits');
    expect(html).not.toContain('Loss room');
  });

  it('stands aside in the all-journals view, where one account’s limits do not apply', () => {
    state.viewingAll = true;
    const html = paint(createElement(TodayCard, { trades: [trade({ date: today, pnl: -900 })] }));
    expect(html).toContain('set per journal');
    expect(html).not.toContain('Loss room');
  });
});

describe('CostingCard', () => {
  it('names the plan instead of the analysis on a plan without Performance', () => {
    state.unlocked = false;
    const html = paint(createElement(CostingCard, { trades: Array.from({ length: 40 }, (_, i) => trade({ pnl: i % 2 ? 50 : -80 })), periodLabel: 'September 2026' }));
    expect(html).toContain('and up');
    expect(html).not.toContain('cost you');
  });

  it('says the period is too small rather than ranking four trades', () => {
    const html = paint(createElement(CostingCard, { trades: [trade({ pnl: -50 })], periodLabel: 'September 2026' }));
    expect(html).toContain('Not enough trades in September 2026');
  });
});

describe('TradeLog', () => {
  const day = (date: string, pnls: number[], extra: Partial<Trade> = {}) => pnls.map((pnl) => trade({ date, pnl, ...extra }));

  it('lists the newest day first, each with its net', () => {
    const html = paint(createElement(TradeLog, { trades: [...day('2026-09-14', [100]), ...day('2026-09-28', [-40, 10])], onDayClick: () => undefined }));
    expect(html.indexOf('Sep 28')).toBeLessThan(html.indexOf('Sep 14'));
    expect(html).toContain('-$30.00');
  });

  it('shows a day in the order the rules read it, by import sequence when there are no times', () => {
    // Ids carry the import index; the array order here is deliberately scrambled.
    const first = trade({ id: 'snaptrade_a_0001', date: '2026-09-17', pnl: 11.11 });
    const second = trade({ id: 'snaptrade_a_0002', date: '2026-09-17', pnl: 22.22 });
    const html = paint(createElement(TradeLog, { trades: [second, first], onDayClick: () => undefined }));
    expect(html.indexOf('$11.11')).toBeLessThan(html.indexOf('$22.22'));
  });

  it('has no time column at all when no trade has a time, as on a Schwab import', () => {
    expect(paint(createElement(TradeLog, { trades: day('2026-09-17', [5]), onDayClick: () => undefined }))).not.toContain('>Time<');
    expect(paint(createElement(TradeLog, { trades: day('2026-09-17', [5], { entryTime: '09:41' }), onDayClick: () => undefined }))).toContain('>Time<');
  });

  it('names what broke on a day that broke a rule, judged the way the rule judges it', () => {
    // Wins between the losses, so only the trade cap breaks — four losers in a row would break the
    // streak rule too, and the row names every rule that broke.
    const html = paint(createElement(TradeLog, { trades: day('2026-09-24', [-5, 5, -5, 5]), ruleDates: new Set(['2026-09-24']), onDayClick: () => undefined }));
    expect(html).toContain('4 trades past 3'); // the desktop day row
    expect(html).toContain('Broke 1 rule · trade cap'); // the phone's chip
    const both = paint(createElement(TradeLog, { trades: day('2026-09-25', [-5, -5, -5, -5]), ruleDates: new Set(['2026-09-25']), onDayClick: () => undefined }));
    expect(both).toContain('Broke 2 rules · trade cap, losing streak');
  });

  it('says nothing about rules on a day the calendar did not mark', () => {
    const html = paint(createElement(TradeLog, { trades: day('2026-09-24', [-5, -5, -5, -5]), onDayClick: () => undefined }));
    expect(html).not.toContain('past 3');
    expect(html).not.toContain('Broke');
  });

  it('draws nothing for a period with no trades', () => {
    expect(renderToString(createElement(TradeLog, { trades: [], onDayClick: () => undefined }))).toBe('');
  });
});

describe('PhoneJournalSelect', () => {
  it('is not there with one journal, where there is nothing to switch', () => {
    state.accounts = [{ id: 'default', name: 'Primary journal' }];
    expect(renderToString(createElement(PhoneJournalSelect))).toBe('');
  });

  it('offers every journal, and the combined view only when the plan has it', () => {
    const html = paint(createElement(PhoneJournalSelect));
    expect(html).toContain('Paper account');
    expect(html).toContain('All journals');
    state.canViewAll = false;
    expect(paint(createElement(PhoneJournalSelect))).not.toContain('>All journals<');
    state.canViewAll = true;
  });
});
