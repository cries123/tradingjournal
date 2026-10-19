import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Trade } from '../types';

/*
 * The Performance screen as the approved redesign draws it: six figures, a verdict band (where the
 * money goes, where it comes from, the one change), then the breakdowns ranked by money down the left
 * with the biggest drawn at full size beside them. On a phone the breakdowns are rows that open as
 * pages. Plus the copy bugs this screen has had before: "293t · 42%", and a tilt sentence that
 * contradicted its own figures.
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
// Static markup never counts up; the figure is asserted at its final value.
vi.mock('./motion/CountUp', () => ({
  CountUp: ({ value, format }: { value: number; format: (n: number) => string }) => format(value),
}));

const { PerformanceContent } = await import('./PerformanceContent');
const { DashboardView } = await import('./DashboardView');
const { PanelShell } = await import('./analytics/PanelShell');
const { InAppProvider } = await import('./layout/PageFrame');

const paint = (el: Parameters<typeof renderToString>[0]) =>
  renderToString(el).replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/⁠/g, '');
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

const perf = (extra: Record<string, unknown> = {}) =>
  paint(createElement(InAppProvider, null, createElement(PerformanceContent, { trades: journal(), year: 2026, month: 7, onBack: noop, ...extra })));

/** The desktop's breakdown list, on its own — the phone draws the same names again further down. */
const desktopList = (html: string) => html.slice(html.indexOf('aria-label="Breakdowns"'), html.indexOf('</nav>'));

describe('the Performance screen', () => {
  it('opens with the verdict: the drain, the engine and the one change', () => {
    const words = text(perf());
    expect(words).toContain('Where the money goes');
    expect(words).toContain('-$4,320.00');
    expect(words).toContain('Your 4th and later trades of the day, across 48 trades. Everything before them made money.');
    expect(words).toContain('Where it comes from');
    expect(words).toContain('Your 1st trade of the day, across 16 trades — the best spot in your day.');
    expect(words).toContain('The one change');
    expect(words).toContain('Stop after three');
    // The rule simulator's own figure for a three-trade cap: 1st + 2nd + 3rd = 1,740 − 240 + 540.
    expect(words).toContain('The trades before your fourth made +$2,040.00');
  });

  it('names the journal, the period and the count in the toolbar, so this screen and the Overview can disagree honestly', () => {
    const words = text(perf());
    expect(words).toContain('Schwab · 2026 · 88 trades');
    // And on a phone, beside the net, where the toolbar has scrolled away.
    expect(words).toContain('Net P&L · 2026');
  });

  it('draws the six figures the design names, with what each one means', () => {
    const words = text(perf());
    for (const label of ['Net P&L', 'Win rate', 'Profit factor', 'Expectancy', 'Max drawdown', 'Fees']) {
      expect(words).toContain(label);
    }
    expect(words).toContain('-$2,280.00');
    expect(words).toContain('under 1.0 — losing');
    expect(words).toContain('need 48% at your payoff');
    // Twelve losing SPY days before the CVX wins: the account never rose above where it started.
    expect(words).toContain('Max drawdown -$3,480 from where the period began');
  });

  it('ranks the breakdowns by money, with the biggest chosen and drawn at full size', () => {
    const html = perf();
    const list = desktopList(html);
    const order = ['Trade of the day', 'Symbols', 'Trades per day', 'Calls, puts, shares'].map((t) => list.indexOf(`>${t}<`));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Exactly one is chosen, and it is the first.
    expect(list.split('aria-current="true"').length - 1).toBe(1);
    expect(list.indexOf('aria-current="true"')).toBeLessThan(list.indexOf('>Trade of the day<'));
    // Its card is the one on screen: the lead sentence and the table.
    const words = text(html);
    expect(words).toContain('Your 4th and later trades cost you $4,320.00 across 48 trades. Your 1st trade is the best one at $108.75 a trade.');
    expect(words).toContain('How this is counted');
  });

  it('leads every breakdown in the list with its figure', () => {
    const words = text(desktopList(perf()));
    expect(words).toContain('Trade of the day -$4,320');
    expect(words).toContain('Symbols -$3,480');
    expect(words).toMatch(/Fees \$87/);
  });

  it('names what the broker did not send at the bottom of the list, rather than drawing empty cards', () => {
    const words = text(desktopList(perf()));
    expect(words).toContain('Needs your input');
    expect(words).toContain('Hour of day needs entry times');
    expect(words).toContain('R multiples needs your risk');
    expect(words).toContain('Discipline tick a checklist');
    expect(words.indexOf('Needs your input')).toBeGreaterThan(words.indexOf('Trade of the day'));
  });

  it('offers the rule simulator where a cap would have helped, with the simulator’s figure, and only with somewhere to go', () => {
    const withSim = text(perf({ onOpenSimulator: noop }));
    expect(withSim).toContain('Test it in the rule simulator');
    expect(withSim).toContain('A 3-trade daily cap would have turned');
    expect(withSim).toContain('+$2,040.00 instead of -$2,280.00');
    expect(withSim).toContain('Simulate →');
    const without = text(perf());
    expect(without).toContain('Test it in the rule simulator');
    expect(without).not.toContain('Simulate');
  });

  it('writes trade counts as words, never as "293t"', () => {
    const html = perf();
    expect(html).not.toMatch(/\d+t · /);
    expect(text(html)).toContain('Trades');
    expect(html).not.toContain('/t<');
    expect(text(html)).toContain('Avg / trade');
  });

  it('draws no back link: Performance is a sidebar and bottom-bar destination', () => {
    expect(text(perf())).not.toContain('Back to dashboard');
  });

  it('on a phone keeps the same list as rows with their figures, and the verdict as one card', () => {
    const html = perf({ onOpenSimulator: noop });
    const phone = html.slice(html.lastIndexOf('Breakdowns · biggest first'));
    expect(text(phone)).toContain('Trade of the day -$4,320');
    // The phone card's change, with the simulator beside it.
    expect(text(html)).toContain('Stop after three — the trades before your fourth made +$2,040.00');
    expect(html).toMatch(/>Simulate</);
  });

  it('says so plainly when the period is empty, and keeps the controls to change it', () => {
    const html = paint(createElement(InAppProvider, null, createElement(PerformanceContent, { trades: journal(), year: 2025, month: 7, onBack: noop })));
    expect(text(html)).toContain('No trades in 2025. Try a wider period.');
    expect(html).toContain('aria-label="Period"');
  });

  it('a panel card on the landing page still leads with the finding on a phone and keeps the numbers behind a tap', () => {
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

  it('names the period and the journal in the toolbar', () => {
    expect(text(overview(journal()))).toMatch(/· August 2026/);
  });

  // The equity curve was built, shrunk to a strip, and then removed at Jay's request: it took
  // more room than a one-second read was worth. The Risk group still states the max drawdown.
  it('draws no equity curve', () => {
    expect(overview(journal())).not.toContain('equity-line');
  });
});
