import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Trade } from '../types';

/*
 * The Performance screen's second pass: a verdict at the top, panels ranked and sized by money,
 * every card leading with its figure, the finding first on a phone, and the Overview's equity
 * curve. Plus the two copy bugs: "293t · 42%" and a tilt sentence that contradicted its figures.
 */

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
  getFirebaseStorage: () => ({}),
}));
vi.mock('../lib/firebaseAuth', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseApp: () => ({}),
}));
vi.mock('../services/admin', () => ({ isCurrentUserAdmin: async () => false }));
vi.mock('../hooks/useAiTakeaway', () => ({ useAiTakeaway: () => ({ text: null, pending: false }) }));
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'trader@example.com', emailVerified: true, metadata: {}, providerData: [] },
    username: 'temp',
    loading: false,
    firebaseEnabled: true,
    needsUsername: false,
    profileLoading: false,
    logout: async () => undefined,
  }),
}));
vi.mock('../context/useSettings', () => ({
  useSettings: () => ({
    settings: {
      currency: 'USD',
      defaultSymbol: 'SPY',
      themeAccent: 'lime',
      setupTags: [],
      accounts: [{ id: 'default', name: 'Schwab' }],
      activeAccountId: 'default',
      strategies: [],
      tradingRules: { enabled: false },
      monthlyGoalPnl: 0,
      accountSize: 0,
      trackRecordJournals: null,
    },
    saveState: { status: 'idle', at: 0 },
    journalLimit: 9007199254740991,
    canAddJournal: true,
    viewingAllJournals: false,
    updateSettings: () => undefined,
    setActiveAccount: () => undefined,
  }),
}));
vi.mock('../context/useEntitlement', () => ({
  useEntitlement: () => ({ tier: 'diamond', has: () => true, loaded: true, loading: false, limits: {}, usage: {} }),
}));

const { PerformanceContent } = await import('./PerformanceContent');
const { DashboardView } = await import('./DashboardView');
const { TiltPanel } = await import('./analytics/BrokerInsightSection');
const { PanelShell } = await import('./analytics/PanelShell');
const { InAppProvider } = await import('./layout/PageFrame');

const paint = (el: Parameters<typeof renderToString>[0]) =>
  renderToString(el).replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const noop = () => undefined;

let n = 0;
const trade = (over: Partial<Trade>): Trade =>
  ({
    id: `snaptrade_acc_1_${String(n++).padStart(4, '0')}`,
    date: '2026-08-03',
    symbol: 'SPY',
    pnl: 0,
    quantity: 2,
    tradePrice: 2,
    assetType: 'option',
    optionType: 'call',
    expiration: '2026-08-03',
    openDate: '2026-08-03',
    fees: 1,
    ...over,
  }) as Trade;

/** SPY 0DTE that bleeds after the third trade of the day, and CVX shares that win. */
function journal(): Trade[] {
  n = 0;
  const trades: Trade[] = [];
  for (let day = 1; day <= 12; day++) {
    const date = `2026-08-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < 7; i++) {
      const late = i >= 3;
      const pnl = late ? (i % 2 === 0 ? -120 : -60) : i === 1 ? -20 : 45;
      trades.push(trade({ date, openDate: date, expiration: date, pnl, grossPnl: pnl + 1, optionType: i % 3 === 0 ? 'put' : 'call' }));
    }
  }
  for (let day = 13; day <= 16; day++) {
    const date = `2026-08-${day}`;
    trades.push(trade({ date, openDate: date, symbol: 'CVX', assetType: 'stock', expiration: undefined, pnl: 300, grossPnl: 300.65, fees: 0.65, quantity: 50, tradePrice: 150 }));
  }
  return trades;
}

const perf = () =>
  paint(createElement(InAppProvider, null, createElement(PerformanceContent, { trades: journal(), year: 2026, month: 7, onBack: noop })));

describe('the Performance screen', () => {
  it('opens with the verdict: the drain, the engine and the one change, with the period named', () => {
    const words = text(perf());
    expect(words).toContain('The verdict · 2026');
    expect(words).toContain('Where the money goes');
    expect(words).toContain('Your 4th+ trades of the day cost you $4,320.00 across 48 trades.');
    expect(words).toContain('Where it comes from');
    expect(words).toContain('Your 1st trade of the day made you $1,740.00 across 16 trades.');
    expect(words).toContain('The one change');
    expect(words).toContain('Stop after your third trade of the day.');
  });

  it('names the period on every section heading, so the Overview and this screen can disagree honestly', () => {
    const words = text(perf());
    expect(words).toContain('What you traded · 2026 · 88 trades');
    expect(words).toContain('What you recorded · 2026');
  });

  it('puts the panel worth the most money first, full width and featured, with the rest ranked behind it', () => {
    const html = perf();
    const featured = html.indexOf('data-featured="true"');
    expect(featured).toBeGreaterThan(-1);
    // The featured card is the sequence panel — the $4,320 finding — not the edge panel that led before.
    const featuredCard = html.slice(featured, html.indexOf('</div>', html.indexOf('</h3>', featured)));
    expect(featuredCard).toContain('Rhythm');
    expect(html.indexOf('data-featured="true"')).toBeLessThan(html.indexOf('class="panel-grid"'));
    // Exactly one featured card.
    expect(html.split('data-featured="true"').length - 1).toBe(1);
  });

  it('leads every card with its figure', () => {
    const html = perf();
    // The sequence card's header carries its biggest row as the figure.
    expect(text(html)).toContain('4th+ trades of the day -$4,320.00');
    expect(text(html)).toContain('In fees');
  });

  it('writes trade counts as words, never as "293t"', () => {
    const html = perf();
    expect(html).not.toMatch(/\d+t · /);
    expect(text(html)).toContain('48 trades · 0% win');
    expect(html).not.toContain('/t<');
    expect(text(html)).toContain('/trade');
  });

  it('on a phone leads with the finding and keeps the numbers behind a tap', () => {
    const html = paint(
      createElement(PanelShell, {
        eyebrow: 'Rhythm',
        title: 'How the day unfolds',
        icon: null,
        note: 'The finding.',
        children: createElement('div', null, 'the numbers'),
      }),
    );
    expect(html).toContain('Show the numbers');
    expect(html).toContain('aria-expanded="false"');
    // The body is hidden until md, the note comes first until md.
    expect(html).toMatch(/order-3 md:order-2 [^"]*hidden md:flex/);
    expect(html).toMatch(/order-1 md:order-3/);
    // A panel with no finding has nothing to collapse and shows its numbers everywhere.
    const plain = paint(createElement(PanelShell, { eyebrow: 'X', title: 'Y', icon: null, children: 'numbers' }));
    expect(plain).not.toContain('Show the numbers');
    expect(plain).not.toContain('hidden md:flex');
  });
});

describe('the trade after a loss', () => {
  const panel = (afterLossAvg: number, afterWinAvg: number) =>
    text(
      paint(
        createElement(TiltPanel, {
          data: { afterLossAvg, afterLossCount: 164, afterWinAvg, afterWinCount: 127, delta: afterLossAvg - afterWinAvg },
          currency: 'USD',
        }),
      ),
    );

  it('no longer says "the same" over a gap of $36', () => {
    const words = panel(2.34, -34.03);
    expect(words).not.toContain('You trade the same');
    expect(words).toContain('The trade after a loss is worth $36.37 more than the one after a win');
  });

  it('says "about the same" only when the gap is small next to the figures', () => {
    expect(panel(-50.16, -46.18)).toContain('You trade about the same after a loss as after a win');
    expect(panel(-80, -20)).toContain('cost of trading angry');
  });
});

describe('the Overview', () => {
  const overview = (trades: Trade[]) =>
    paint(
      createElement(
        InAppProvider,
        null,
        createElement(DashboardView, {
          trades,
          hasAnyTrades: true,
          year: 2026,
          month: 7,
          filters: { symbol: '', setup: '', side: '', tag: '' },
          filterSymbols: ['SPY'],
          filterSetups: [],
          onFiltersChange: noop,
          onDayClick: noop,
          onPrevMonth: noop,
          onNextMonth: noop,
          onMonthChange: noop,
          onPrevYear: noop,
          onNextYear: noop,
          onSelectMonth: noop,
          onAddTrade: noop,
          onConnectBroker: noop,
        }),
      ),
    );

  it('draws the equity curve for the period, with the drawdown as its figure', () => {
    const html = overview(journal());
    expect(text(html)).toContain('Running P&L · August 2026');
    expect(html).toContain('class="equity-line"');
    expect(html).toContain('Max drawdown');
  });

  it('draws no curve for two trading days', () => {
    n = 0;
    const html = overview([trade({ date: '2026-08-03', pnl: 10 }), trade({ date: '2026-08-04', pnl: -5 })]);
    expect(html).not.toContain('equity-line');
  });

  it('names the period beside the insights heading', () => {
    expect(text(overview(journal()))).toContain("What's working, what's not · August 2026");
  });
});

describe('the stylesheet', () => {
  it('draws the equity line only when motion is welcome, and holds it until the card is seen', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const allowed = css.indexOf('@media (prefers-reduced-motion: no-preference) {');
    const block = css.slice(allowed, css.indexOf('\n}\n', allowed));
    expect(block).toContain('.equity-line {');
    expect(block).toContain("[data-revealed='false'] .equity-line");
    expect(css.replace(block, '')).not.toContain('.equity-line');
  });
});
