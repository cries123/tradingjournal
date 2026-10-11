import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Trade } from '../types';

/*
 * The journal app's look-and-motion pass: the Overview's header and hero, calls vs puts, the track
 * record preview, the one period toggle, and the motion rules — dialogs that play out, cards and
 * bars that wait to be seen, and none of it under reduced motion.
 *
 * First paint only (renderToString runs no effects), plus source and stylesheet assertions for the
 * parts a node test cannot click.
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
      themeAccent: 'emerald',
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
    updateSettings: () => undefined,
    setActiveAccount: () => undefined,
  }),
}));
vi.mock('../context/useEntitlement', () => ({
  useEntitlement: () => ({ tier: 'diamond', has: () => true, loaded: true, loading: false, limits: {}, usage: {} }),
}));

import { DashboardView } from './DashboardView';
import { StatsCards } from './StatsCards';
import { DashboardDayCell } from './DashboardDayCell';
import { SegmentedControl } from './ui/SegmentedControl';
import { PageFrame, InAppProvider } from './layout/PageFrame';
import { PanelShell, BarRow } from './analytics/PanelShell';
import { CountUp } from './motion/CountUp';
import { TrackRecordContent } from './trackRecord/TrackRecordContent';
import { AssistantContent } from './analytics/AssistantContent';
import { computeStats } from '../utils/stats';
import { buildTrackRecord, toPublishedRecord } from '../utils/trackRecord';

const noop = () => undefined;
const paint = (element: Parameters<typeof renderToString>[0]) =>
  renderToString(element).replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

let n = 0;
const trade = (over: Partial<Trade>): Trade =>
  ({
    id: `t${n++}`,
    date: '2026-07-14',
    symbol: 'SPY',
    side: 'long',
    pnl: 100,
    assetType: 'option',
    optionType: 'call',
    quantity: 1,
    accountId: 'default',
    ...over,
  }) as Trade;

const dashboard = (trades: Trade[]) =>
  paint(
    createElement(
      InAppProvider,
      null,
      createElement(DashboardView, {
        trades,
        hasAnyTrades: true,
        year: 2026,
        month: 6,
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

describe('the Overview', () => {
  const options = [trade({ pnl: 120 }), trade({ pnl: -40, optionType: 'put' }), trade({ pnl: 80, date: '2026-07-15' })];

  it('has a title, like every other screen', () => {
    expect(dashboard(options)).toMatch(/<h1[^>]*>Overview<\/h1>/);
  });

  it('puts the filters in the header, above everything they narrow', () => {
    // They were under the calendar, where they read as a control for the card below them.
    const html = dashboard(options);
    const filter = html.indexOf('aria-label="Filter by Symbol"');
    expect(filter).toBeGreaterThan(-1);
    expect(filter).toBeLessThan(html.indexOf('Net P&L'));
    expect(filter).toBeLessThan(html.indexOf('>Calendar<'));
  });

  it('splits an options trader who never sells short into calls and puts', () => {
    const html = dashboard(options);
    expect(html).toContain('Calls vs Puts');
    expect(html).not.toContain('Long vs Short');
  });

  it('keeps long vs short for anyone who sold short', () => {
    const html = dashboard([...options, trade({ side: 'short', pnl: 30 })]);
    expect(html).toContain('Long vs Short');
  });
});

describe('the hero', () => {
  const stats = computeStats([trade({ pnl: 200 }), trade({ pnl: 200 }), trade({ pnl: -100 })]);

  it('lays its five figures across the card as labelled figures', () => {
    const html = paint(createElement(StatsCards, { stats }));
    const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1]);
    expect(labels).toEqual(['Win rate', 'Profit factor', 'Avg win/loss', 'Avg/trade', 'Wins / losses']);
  });

  it('gives screen readers the net figure once, not the count', () => {
    const html = paint(createElement(StatsCards, { stats }));
    expect(html).toContain('<span class="sr-only">$300.00</span>');
  });
});

describe('CountUp', () => {
  it('reserves the width of the final figure from the first frame', () => {
    const html = paint(createElement(CountUp, { value: -2068.2, format: (v: number) => v.toFixed(2), from: 0 }));
    // The counting copy starts at zero; the invisible copy that sizes the box is already the end.
    expect(html).toMatch(/class="invisible[^"]*">-2068\.20</);
    expect(html).toMatch(/aria-hidden="true" class="col-start-1 row-start-1">0\.00</);
    expect(html).toContain('<span class="sr-only">-2068.20</span>');
  });
});

describe('the calendar', () => {
  const summary = { totalPnl: 250, tradeCount: 3, trades: [] } as never;

  it('pops a day that a sync just filled, and only that day', () => {
    const fresh = paint(createElement(DashboardDayCell, { dayNumber: 4, summary, fresh: true }));
    const settled = paint(createElement(DashboardDayCell, { dayNumber: 4, summary }));
    expect(fresh).toContain('animate-cell-pop');
    expect(settled).not.toContain('animate-cell-pop');
  });

  it('hands each day cell whether it just arrived', () => {
    // A pop needs a second render with new trades, which renderToString cannot do; nextDaySeen is
    // tested on its own, and this pins that the calendar actually feeds its answer to the cells.
    const calendar = readFileSync('src/components/DashboardCalendar.tsx', 'utf8');
    expect(calendar).toContain('nextDaySeen(seen, monthKey, days)');
    expect(calendar).toContain('fresh={day.date ? fresh.has(dayKey(year, month, day.date.getDate())) : false}');
  });
});

describe('SegmentedControl', () => {
  it('is a labelled group with exactly one option pressed', () => {
    const html = paint(
      createElement(SegmentedControl, {
        label: 'Period',
        value: 'year',
        onChange: noop,
        options: [
          { id: 'month', label: 'This month' },
          { id: 'year', label: 'This year' },
          { id: 'all', label: 'All time' },
        ],
      }),
    );
    expect(html).toContain('role="group" aria-label="Period"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>This year</);
  });

  it('is the only period toggle on the screens that had their own', () => {
    for (const file of [
      'src/components/DashboardView.tsx',
      'src/components/PerformanceContent.tsx',
      'src/components/simulator/RuleSimulatorContent.tsx',
      'src/components/analytics/AssistantPanel.tsx',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('<SegmentedControl');
      expect(source).not.toContain('aria-pressed=');
    }
  });
});

describe('the back link', () => {
  const frame = (sidebarDestination: boolean) =>
    paint(
      createElement(
        InAppProvider,
        null,
        createElement(PageFrame, { title: 'Performance', onBack: noop, sidebarDestination, children: 'body' }),
      ),
    );

  it('is a phone control on a screen the sidebar already links to', () => {
    expect(frame(true)).toMatch(/class="md:hidden [^"]*"[^>]*>.*Back to dashboard/);
  });

  it('stays on desktop for a sub-screen the sidebar does not list', () => {
    expect(frame(false)).not.toContain('md:hidden');
  });
});

describe('analysis panels', () => {
  it('wait to be seen before they rise in, and their bars wait with them', () => {
    const html = paint(
      createElement(PanelShell, {
        eyebrow: 'Rhythm',
        title: 'How the day unfolds',
        icon: null,
        children: createElement(BarRow, { label: '1st', value: 100, valueText: '$100', maxAbs: 100, index: 2 }),
      }),
    );
    expect(html).toContain('data-revealed="false"');
    expect(html).toMatch(/class="reveal panel-card spotlight/);
    expect(html).toMatch(/class="bar-in [^"]*"/);
    expect(html).toContain('--i:2');
  });
});

describe('the track record preview', () => {
  const verified = (pnl: number, date: string) => trade({ pnl, date, sourceId: `snaptrade:${n}` });
  const trades = Array.from({ length: 4 }, (_, i) => verified(i % 2 ? -50 : 150, `2026-07-0${i + 1}`));

  it('shows the page itself beside the controls, without the sign-up pitch', () => {
    const html = paint(createElement(TrackRecordContent, { trades, onBack: noop }));
    expect(html).toContain('Preview · what visitors see');
    expect(html).toContain('temp’s verified trading record');
    expect(html).not.toContain('Start your own journal');
  });

  it('builds the page the way publishing does, so amounts turned off are not in it', () => {
    const record = buildTrackRecord(trades);
    const hidden = toPublishedRecord(record, { username: 'temp', showAmounts: false, updatedAt: 'x' });
    const shown = toPublishedRecord(record, { username: 'temp', showAmounts: true, updatedAt: 'x' });
    expect('netPnl' in hidden).toBe(false);
    expect('avgWin' in hidden).toBe(false);
    expect(shown.netPnl).toBe(record.netPnl);
  });

  it('is built by the same function the server publishes with', () => {
    const handler = readFileSync('server/trackRecordHandler.ts', 'utf8');
    const screen = readFileSync('src/components/trackRecord/TrackRecordContent.tsx', 'utf8');
    expect(handler).toContain('toPublishedRecord(record,');
    expect(screen).toContain('toPublishedRecord(record,');
  });
});

describe('the assistant page', () => {
  const periods = [
    { scope: 'month' as const, label: 'July 2026', trades: [trade({ pnl: 120 }), trade({ pnl: -60, date: '2026-07-15' })] },
    { scope: 'year' as const, label: '2026', trades: [trade({ pnl: 120 })] },
  ];
  const html = paint(createElement(InAppProvider, null, createElement(AssistantContent, { periods, onBack: noop })));

  it('opens on the conversation, not on a row of stat tiles', () => {
    expect(html).toContain('What do you want to know about July 2026?');
    for (const tile of ['Saved conversations', 'Questions asked', 'Switch period in the chat']) {
      expect(html).not.toContain(tile);
    }
  });

  it('keeps the allowance, as a meter under the history', () => {
    const history = html.indexOf('>History');
    const meter = html.indexOf('Questions left today');
    expect(history).toBeGreaterThan(-1);
    expect(meter).toBeGreaterThan(history);
  });

  it('opens on a period that has trades when this month has none yet', () => {
    // October 11th, nothing traded yet in October: the page said "no trades in this period" over a
    // journal with hundreds in it and showed none of its findings.
    const quietMonth = [
      { scope: 'month' as const, label: 'October 2026', trades: [] },
      { scope: 'year' as const, label: '2026', trades: [trade({ pnl: 120 }), trade({ pnl: -60 })] },
      { scope: 'all' as const, label: 'All time', trades: [trade({ pnl: 120 })] },
    ];
    const page = paint(createElement(InAppProvider, null, createElement(AssistantContent, { periods: quietMonth, onBack: noop })));
    expect(page).toContain('What do you want to know about 2026?');
    expect(page).not.toContain('No trades in');
    expect(page).toMatch(/aria-pressed="true"[^>]*>2026</);
  });

  it('puts the conversation above the history on a phone', () => {
    const chat = html.indexOf('order-1 lg:order-2');
    const rail = html.indexOf('order-2 lg:order-1');
    expect(chat).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(-1);
  });

  it('picks the period with the app’s one toggle', () => {
    expect(html).toContain('role="group" aria-label="Period"');
  });

  it('reads the conversation in a column, not across the whole panel', () => {
    // The scrolling conversation itself, not just the composer under it, which is capped too.
    expect(html).toMatch(/overflow-y-auto[^"]*"><div class="mx-auto w-full max-w-3xl">/);
  });
});

describe('dialogs play out instead of vanishing', () => {
  const DIALOGS = [
    'src/components/TradeModal.tsx',
    'src/components/CsvImportModal.tsx',
    'src/components/ConfirmDialog.tsx',
    'src/components/ShareCardModal.tsx',
    'src/components/OnboardingOverlay.tsx',
    'src/components/search/JournalSearch.tsx',
    'src/components/analytics/AssistantDock.tsx',
  ];

  it('route every way out through the exit animation', () => {
    for (const file of DIALOGS) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain('useAnimatedClose(');
      expect(source, file).toContain("'animate-scale-out'");
      // A close wired straight to the prop skips the animation — the bug Escape had on the drawer.
      expect(source, file).not.toMatch(/onClick=\{onClose\}|onClick=\{onCancel\}|useEscapeToClose\(onClose|useEscapeToClose\(onCancel/);
    }
  });

  it('slides the day drawer out on Escape too, not only from the X', () => {
    const drawer = readFileSync('src/components/DayDetailDrawer.tsx', 'utf8');
    expect(drawer).toContain('useEscapeToClose(handleClose,');
  });
});

describe('the stylesheet', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const reduce = (() => {
    const at = css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .motion-safe\\:animate-page-in');
    return css.slice(at, css.indexOf('\n}\n', at));
  })();

  it('switches the new animations off under reduced motion', () => {
    for (const name of ['.animate-scale-out', '.animate-backdrop-out', '.skeleton-shimmer', '.animate-msg-in', '.typing-dot']) {
      expect(reduce).toContain(name);
    }
  });

  it('only hides a card or a bar while waiting when motion is welcome', () => {
    // Under reduced motion a card must simply be there. If these rules leaked out of the
    // no-preference block, a reader with reduced motion on would get cards stuck invisible.
    const allowed = css.indexOf('@media (prefers-reduced-motion: no-preference) {');
    const block = css.slice(allowed, css.indexOf('\n}\n', allowed));
    expect(block).toContain(".reveal[data-revealed='false']");
    expect(block).toContain('.bar-in {');
    const outside = css.replace(block, '');
    expect(outside).not.toContain("[data-revealed='false']");
    expect(outside).not.toContain('.bar-in');
  });

  it('leaves a revealed card with no transform, so fixed children are not trapped in it', () => {
    expect(css).not.toMatch(/\.reveal\[data-revealed='true'\][^}]*translate/);
    expect(css).toMatch(/\.reveal\[data-revealed='false'\] \{\s*opacity: 0;\s*transform: translateY\(14px\);/);
  });

  it('layers the stat chip so a coloured value or border on one can win', () => {
    expect(css).toMatch(/@layer components \{\s*\.stat-chip \{/);
  });
});
