import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Trade } from '../types';
import { toDateKey } from '../utils/format';

/*
 * A first paint of every screen this release touched, with nothing mocked but the network and the
 * three contexts.
 *
 * Not a visual test — there is no browser here — but renderToString runs every line of render code
 * with real props against the real analytics, which is where a panel reading `rows[0]` of an empty
 * array, a `Math.max()` over nothing, or a renamed prop would throw. Effects do not run, so no
 * subscription is opened and nothing is fetched.
 *
 * Worth having for exactly these components: most of them reduce over the trade list to find a
 * best and a worst row, and the interesting inputs are the degenerate ones — one trade, no
 * winners, no losers, nothing at all.
 */

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));

vi.mock('../services/admin', () => ({
  isCurrentUserAdmin: async () => false,
}));

vi.mock('../hooks/useSupportUnread', () => ({
  useSupportUnread: () => 2,
}));

vi.mock('../hooks/useCoachingCount', () => ({
  useCoachingCount: () => 1,
}));

// The coach seat is entirely server-mediated, so every one of these is a fetch the render must
// not make. Effects do not run under renderToString, but the module still has to import.
vi.mock('../services/coachSeat', () => ({
  fetchSeat: async () => ({ state: 'none', coachEmail: null, invitedAt: null, acceptedAt: null }),
  inviteCoach: async () => ({ state: 'pending', coachEmail: 'coach@example.com' }),
  revokeCoach: async () => ({ state: 'none' }),
  fetchCoaching: async () => ({ journals: [] }),
  fetchCoachedJournal: async () => ({ trades: [], since: '2026-05-12', notes: [] }),
  postCoachNote: async () => ({}),
  fetchMyCoachNotes: async () => ({ notes: [] }),
  markCoachNotesRead: async () => ({ cleared: 0 }),
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'trader@example.com' },
    username: 'chelo618',
    loading: false,
    firebaseEnabled: true,
    logout: async () => undefined,
  }),
}));

vi.mock('../context/useSettings', () => ({
  useSettings: () => ({
    settings: {
      currency: 'USD',
      setupTags: ['BREAKOUT'],
      accounts: [{ id: 'default', name: 'Primary journal' }],
      activeAccountId: 'default',
      tradingRules: { enabled: true, maxDailyLoss: 500, maxTradesPerDay: 4 },
      remindersEnabled: false,
      reminderTime: '17:00',
      autoSyncEnabled: true,
      ruleAlertsEnabled: true,
    },
    updateSettings: () => undefined,
    addSetupTag: () => undefined,
    addStrategy: () => undefined,
    removeStrategy: () => undefined,
    addAccount: () => undefined,
    removeAccount: () => undefined,
    setActiveAccount: () => undefined,
  }),
}));

vi.mock('../context/useEntitlement', () => ({
  useEntitlement: () => ({
    tier: 'diamond',
    limits: { syncsPerDay: 5, aiMessagesPerDay: 40, brokerConnections: 5 },
    status: 'active',
    source: 'purchase',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    complimentaryUntil: null,
    onTrial: false,
    usage: { aiMessagesUsed: 3, aiMessagesRemaining: 37, syncsUsed: 1, syncsRemaining: 4, aiCredits: 0, syncCredits: 2 },
    loading: false,
    loaded: true,
    has: () => true,
    refresh: async () => undefined,
    noteUsage: () => undefined,
  }),
}));

import { Sidebar } from './Sidebar';
import { SupportDashboard } from './support/SupportDashboard';
import { AssistantContent } from './analytics/AssistantContent';
import { BrokerInsightSection } from './analytics/BrokerInsightSection';
import { ExecutionPrompts, ExecutionSection } from './analytics/ExecutionSection';
import { TradingInsightsSection } from './analytics/TradingInsightsSection';
import { PerformanceContent } from './PerformanceContent';
import { DiamondSection } from './settings/DiamondSection';
import { RuleStandingBanner } from './RuleStandingBanner';
import { CoachNotesPanel } from './coach/CoachNotesPanel';
import { CoachInboxContent } from './coach/CoachInboxContent';
import { MobileBottomNav } from './MobileNav';

const noop = () => undefined;

/**
 * The painted text, as a reader sees it.
 *
 * Server rendering separates adjacent text with comment nodes and escapes the characters this
 * app's copy is full of — the ampersand in "P&L", the apostrophe in "Best day's share". Asserting
 * against the raw markup means writing `P&amp;L` in the test, which is a test of the HTML encoder
 * rather than of the panel.
 */
const paint = (element: Parameters<typeof renderToString>[0]) =>
  renderToString(element)
    .replace(/<!-- -->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

let counter = 0;
const trade = (over: Partial<Trade> = {}): Trade =>
  ({ id: `t${counter++}`, date: '2026-08-03', symbol: 'SPY', pnl: 0, ...over }) as Trade;

/**
 * A journal that looks like a Schwab import: no entry time, no tags, no grade, no R multiple —
 * just fills, sizes, fees and expiries. This is the case the Performance screen used to draw one
 * panel for.
 */
function syncedJournal(): Trade[] {
  const trades: Trade[] = [];
  for (let day = 1; day <= 12; day++) {
    const date = `2026-08-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < 4; i++) {
      const winner = (day + i) % 3 !== 0;
      trades.push(
        trade({
          date,
          symbol: i % 2 === 0 ? 'SPY' : 'AAPL',
          assetType: 'option',
          optionType: i % 2 === 0 ? 'call' : 'put',
          side: i % 2 === 0 ? 'long' : 'short',
          quantity: 1 + i,
          tradePrice: 1.5 + i,
          expiration: i === 0 ? date : '2026-09-18',
          grossPnl: winner ? 130 : -160,
          fees: 2.6,
          pnl: winner ? 127.4 : -162.6,
        }),
      );
    }
  }
  return trades;
}

const sidebar = (appView: Parameters<typeof Sidebar>[0]['appView']) =>
  createElement(Sidebar, {
    appView,
    onDashboard: noop,
    onAddTrade: noop,
    onConnectBroker: noop,
    onPerformance: noop,
    onSimulator: noop,
    onTrackRecord: noop,
    onAssistant: noop,
    onSettings: noop,
    onSupport: noop,
    onCoach: noop,
    onAdmin: noop,
    onHome: noop,
  });

describe('Sidebar', () => {
  it('paints the six destinations and nothing that used to scroll', () => {
    const html = renderToString(sidebar('dashboard'));

    for (const label of [
      'Overview', 'Performance', 'Rule simulator', 'Assistant', 'Connect broker', 'Settings', 'Support',
    ]) {
      expect(html).toContain(label);
    }
    /* The three that moved into Support, the two that moved out of the nav, and the leaderboard,
       which was removed outright. Share month is still a feature — it lives in the dashboard
       toolbar, which is why it must not also be a nav row. */
    for (const gone of [
      'Supported brokers', 'Report a bug', 'Request broker', 'Share month', 'Clear journal',
      'Leaderboard',
    ]) {
      expect(html).not.toContain(gone);
    }
  });

  it('leaves the account screens to the top bar', () => {
    // They lived under the identity row for one release and moved into the account dropdown. Two
    // routes to the same three screens, one of them at the very bottom of the panel, is how a nav
    // ends up with eleven destinations again.
    const html = renderToString(sidebar('dashboard'));

    for (const moved of ['Account settings', 'Subscription', 'Order history']) {
      expect(html, moved).not.toContain(moved);
    }
    // The identity row itself stays — it is what the dropdown is about.
    expect(html).toContain('trader@example.com');
  });

  it('does not draw a scrollbar rail down the panel', () => {
    expect(renderToString(sidebar('dashboard'))).toContain('no-scrollbar');
  });

  it('shows unread support replies as a badge', () => {
    expect(renderToString(sidebar('dashboard'))).toContain('>2<');
  });

  it('keeps Support lit while one of the screens it absorbed is open', () => {
    // Landing on "Request broker" with nothing highlighted is how a nav loses the reader.
    const html = renderToString(sidebar('request-broker'));
    expect(html).toContain('aria-current="page"');
  });

  it('paints as a mobile drawer too', () => {
    expect(() =>
      renderToString(createElement(Sidebar, { ...sidebar('dashboard').props, variant: 'drawer' })),
    ).not.toThrow();
  });
});

describe('SupportDashboard', () => {
  it('paints the account facts a support thread would otherwise have to ask for', () => {
    const html = paint(
      createElement(SupportDashboard, { onBack: noop, onBrokers: noop, onRequestBroker: noop }),
    );

    expect(html).toContain('Your account');
    expect(html).toContain('Syncs left today');
    expect(html).toContain('AI left today');
    expect(html).toContain('Report a bug');
    expect(html).toContain('Request a broker');
  });
});

describe('AssistantContent', () => {
  const periods = [
    { scope: 'month' as const, label: 'August 2026', trades: syncedJournal() },
    { scope: 'year' as const, label: '2026', trades: syncedJournal() },
  ];

  it('paints the portal with an empty history', () => {
    const html = paint(createElement(AssistantContent, { periods, onBack: noop }));

    expect(html).toContain('Trading assistant');
    expect(html).toContain('New chat');
    expect(html).toContain('History');
    expect(html).toContain('Questions left today');
  });

  it('paints with no trades at all', () => {
    expect(() =>
      renderToString(
        createElement(AssistantContent, {
          periods: [{ scope: 'month' as const, label: 'August 2026', trades: [] }],
          onBack: noop,
        }),
      ),
    ).not.toThrow();
  });
});

describe('BrokerInsightSection', () => {
  it('draws real panels for a journal with nothing hand-entered in it', () => {
    const html = paint(createElement(BrokerInsightSection, { trades: syncedJournal() }));

    // The whole point of the rebuild: this is a Schwab-shaped journal and the page is full.
    expect(html).toContain('The win rate you need');
    expect(html).toContain('Where the money goes');
    expect(html).toContain('The trade after a loss');
    expect(html).toContain('How the day unfolds');
    expect(html).toContain('Time left when you opened');
    expect(html).toContain('What trading cost you');
  });

  it('draws nothing rather than throwing on an empty journal', () => {
    expect(renderToString(createElement(BrokerInsightSection, { trades: [] }))).not.toContain(
      'The win rate you need',
    );
  });

  it('survives a journal of one trade', () => {
    expect(() =>
      renderToString(createElement(BrokerInsightSection, { trades: [trade({ pnl: 10 })] })),
    ).not.toThrow();
  });

  it('survives a journal with no losing trade in it', () => {
    const allWinners = Array.from({ length: 20 }, () =>
      trade({ pnl: 25, quantity: 1, tradePrice: 10, assetType: 'stock' }),
    );
    expect(() =>
      renderToString(createElement(BrokerInsightSection, { trades: allWinners })),
    ).not.toThrow();
  });
});

describe('ExecutionSection and its prompts', () => {
  it('names the fields a broker import cannot supply', () => {
    const html = paint(createElement(ExecutionPrompts, { trades: syncedJournal() }));

    expect(html).toContain('P&L by hour entered');
    expect(html).toContain('Which setups make money');
    expect(html).toContain('Expectancy in R');
  });

  it('stops naming a field once it is being recorded', () => {
    const tagged = syncedJournal().map((t) => ({ ...t, setup: 'ORB' }));
    expect(renderToString(createElement(ExecutionPrompts, { trades: tagged }))).not.toContain(
      'Which setups make money',
    );
  });

  it('still draws the ticker panel, which needs nothing', () => {
    const html = paint(createElement(ExecutionSection, { trades: syncedJournal() }));
    expect(html).toContain('Which tickers make money');
  });
});

describe('TradingInsightsSection', () => {
  it('leads with the score and its five components', () => {
    const html = paint(createElement(TradingInsightsSection, { trades: syncedJournal() }));

    expect(html).toContain('Score');
    for (const component of ['Edge', 'Payoff', 'Profit factor', 'Recovery', 'Consistency']) {
      expect(html).toContain(component);
    }
    expect(html).toContain('Breakeven win rate');
    expect(html).toContain('Recovery factor');
    expect(html).toContain("Best day's share");
  });

  it('holds the score back on a sample too thin for one', () => {
    const html = renderToString(
      createElement(TradingInsightsSection, { trades: [trade({ pnl: 10 }), trade({ pnl: -5 })] }),
    );
    expect(html).not.toContain('Needs work');
  });
});

describe('PerformanceContent', () => {
  it('paints both halves, with the broker half first', () => {
    const html = paint(
      createElement(PerformanceContent, {
        trades: syncedJournal(),
        year: 2026,
        month: 7,
        onBack: noop,
      }),
    );

    expect(html.indexOf('What you traded')).toBeGreaterThan(-1);
    expect(html.indexOf('What you traded')).toBeLessThan(html.indexOf('What you recorded'));
    expect(html).toContain('The win rate you need');
  });

  it('says so plainly when there is nothing to analyse', () => {
    const html = renderToString(
      createElement(PerformanceContent, { trades: [], year: 2026, month: 7, onBack: noop }),
    );
    expect(html).toContain('Nothing to analyse yet');
  });
});

describe('DiamondSection', () => {
  it('names the three things the top plan buys', () => {
    const html = paint(createElement(DiamondSection));

    expect(html).toContain('Import my trades automatically');
    expect(html).toContain('Tell me when I break my own rules');
    expect(html).toContain('Your coach');
    // The promise that makes auto-sync worth having rather than a bigger number.
    expect(html).toContain('does not spend one');
  });
});

describe('RuleStandingBanner', () => {
  /*
   * The LOCAL date, via the same function the component uses.
   *
   * This was `new Date().toISOString().slice(0, 10)`, which is the UTC date — and RuleStandingBanner
   * asks toDateKey(new Date()), which is local. West of Greenwich those two disagree from early
   * evening until midnight, so these tests tagged their trades with tomorrow, the banner correctly
   * ignored them, and the suite failed for about six hours a day and passed the rest. The component
   * was never wrong.
   */
  const today = toDateKey(new Date());
  const on = (pnl: number, n = 1) =>
    Array.from({ length: n }, () => trade({ date: today, pnl: pnl / n }));

  it('says nothing on a quiet day inside every limit', () => {
    expect(renderToString(createElement(RuleStandingBanner, { trades: on(-20) }))).toBe('');
  });

  it('warns before the daily stop rather than after it', () => {
    const html = paint(createElement(RuleStandingBanner, { trades: on(-450) }));
    expect(html).toContain('close to a limit');
    expect(html).toContain('90% of the way');
  });

  it('names the breach once a limit has actually gone', () => {
    const html = paint(createElement(RuleStandingBanner, { trades: on(-900) }));
    expect(html).toContain('broken one of your own rules');
  });

  it('counts only today', () => {
    const yesterday = trade({ date: '2020-01-02', pnl: -99999 });
    expect(renderToString(createElement(RuleStandingBanner, { trades: [yesterday] }))).toBe('');
  });
});

describe('the coach surfaces', () => {
  it('paints the coach inbox with nothing loaded yet', () => {
    const html = paint(createElement(CoachInboxContent, { onBack: noop }));
    expect(html).toContain('Coaching');
    expect(html).toContain('Loading');
  });

  it('draws nothing for a trader whose coach has written nothing', () => {
    expect(renderToString(createElement(CoachNotesPanel))).toBe('');
  });
});

describe('MobileBottomNav', () => {
  const bar = (appView: Parameters<typeof MobileBottomNav>[0]['appView'] = 'dashboard') =>
    createElement(MobileBottomNav, {
      appView,
      onOpenMenu: noop,
      onAddTrade: noop,
      onDashboard: noop,
      onPerformance: noop,
      onAssistant: noop,
      assistantOpen: false,
    });

  it('fills every column of its grid', () => {
    /* The bug this exists for: removing the leaderboard left four children in a five-column grid,
       which pushed the "+" button off centre and left a hole that read as a missing button. A
       count is a cheap way to catch the next one. */
    const html = paint(bar());
    const grid = /<div class="grid grid-cols-(\d+) h-14">(.*)<\/div><\/nav>/s.exec(html);
    expect(grid).not.toBeNull();

    const columns = Number(grid![1]);
    const children = (grid![2].match(/<button/g) ?? []).length;
    expect(children).toBe(columns);
  });

  it('puts the menu last and the add button in the middle', () => {
    const html = paint(bar());
    const order = ['Overview', 'Performance', 'Log a trade', 'Ask', 'More'];
    let cursor = -1;
    for (const label of order) {
      const at = html.indexOf(label);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('lights the row for the view you are on', () => {
    expect(paint(bar('performance'))).toContain('aria-current="page"');
  });
});
