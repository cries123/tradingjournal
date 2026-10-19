import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { buildJournalFacts, suggestedQuestions } from '../utils/journalFacts';
import { openingFindings } from '../utils/assistantOpening';
import { formatCurrency } from '../utils/format';

/*
 * The Assistant screen as the approved October 2026 design draws it: conversations, the chat and
 * what it can see, on a desktop; "Ask", the starting points and the box on a phone.
 *
 * First paint only — renderToString runs no effects — with the saved conversations handed in
 * through a mock, because the real store reads localStorage and the server render has none.
 */

const store = vi.hoisted(() => ({
  threads: [] as { id: string; title: string; createdAt: number; updatedAt: number; messages: unknown[] }[],
  activeId: null as string | null,
}));
const view = vi.hoisted(() => ({ allJournals: false }));

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));
vi.mock('../context/useSettings', () => ({
  useSettings: () => ({
    settings: {
      currency: 'USD',
      accounts: [{ id: 'default', name: 'Primary journal' }, { id: 'paper', name: 'Paper account' }],
      activeAccountId: 'default',
      tradingRules: { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500 },
    },
    viewingAllJournals: view.allJournals,
  }),
}));
vi.mock('../context/useEntitlement', () => ({
  useEntitlement: () => ({
    tier: 'diamond',
    loaded: true,
    loading: false,
    marketReplayLive: false,
    has: () => true,
    limits: { aiMessagesPerDay: 40 },
    usage: { aiMessagesUsed: 6, aiCredits: 0 },
    noteUsage: () => undefined,
  }),
}));
vi.mock('../hooks/useAssistantThreads', () => ({
  useAssistantThreads: () => {
    const active = store.threads.find((t) => t.id === store.activeId) ?? null;
    const noop = () => undefined;
    return {
      threads: store.threads,
      activeId: store.activeId,
      active,
      messages: active?.messages ?? [],
      append: noop,
      rollbackTo: noop,
      startNew: noop,
      selectThread: noop,
      deleteThread: noop,
      clearAll: noop,
    };
  },
}));

import { AssistantContent } from './analytics/AssistantContent';
import { AssistantPanel } from './analytics/AssistantPanel';
import { AssistantDock } from './analytics/AssistantDock';

const paint = (element: Parameters<typeof renderToString>[0]) =>
  renderToString(element)
    .replace(/<!-- -->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

let n = 0;
/** A month a broker sent: four trades a day, the late ones losing, nothing typed in. */
function august(): Trade[] {
  const trades: Trade[] = [];
  for (let day = 3; day <= 14; day++) {
    const date = `2026-08-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < 4; i++) {
      const win = i < 2 || (day + i) % 3 === 0;
      trades.push({
        id: `t${n++}`, date, symbol: 'SPY', side: 'long', assetType: 'option', optionType: 'call',
        quantity: 1 + i, tradePrice: 2, fees: 2.6, grossPnl: win ? 120 : -190, pnl: win ? 117.4 : -192.6,
      } as Trade);
    }
  }
  return trades;
}

const trades = august();
const rules: TradingRules = { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500 };
const periods = [
  { scope: 'month' as const, label: 'August 2026', trades },
  { scope: 'year' as const, label: '2026', trades },
];
const noop = () => undefined;
/** The facts the hook builds for the month, and the question the seeded conversation opened with. */
const facts = buildJournalFacts(trades, 'August 2026', { includeNotes: false, rules, history: trades })!;
const suggestions = suggestedQuestions(facts);
const asked = suggestions[0];
const page = () => paint(createElement(AssistantContent, { periods, rules, onBack: noop }));

const HOUR = 3_600_000;
const answer = [
  '**Mostly the trades after your third of the day.**',
  '',
  'August closed red. Split by where each trade fell in its day:',
  '',
  '| Trades | Count | Net |',
  '|---|---|---|',
  '| 1st to 3rd | 36 | +$1,200.00 |',
  '| 4th and later | 12 | -$2,311.20 |',
  '',
  '- Every red day ran past three trades.',
].join('\n');

function seed() {
  const now = Date.now();
  store.threads = [
    {
      id: 'a', title: 'Why did August go red?', createdAt: now - HOUR, updatedAt: now - HOUR,
      messages: [
        { role: 'user', content: asked.question, at: now - HOUR },
        { role: 'assistant', content: answer, at: now - HOUR, source: { period: 'August 2026', trades: 48 } },
      ],
    },
    {
      id: 'b', title: 'Is my win rate good enough?', createdAt: now - 3 * 24 * HOUR, updatedAt: now - 3 * 24 * HOUR,
      messages: [
        { role: 'user', content: 'Is my win rate good enough?', at: 1 },
        { role: 'assistant', content: 'Close.', at: 2, source: { period: '2026', trades: 300 } },
      ],
    },
    { id: 'c', title: 'Review July', createdAt: now - 30 * 24 * HOUR, updatedAt: now - 30 * 24 * HOUR, messages: [{ role: 'user', content: 'Review July', at: 1 }] },
  ];
  store.activeId = 'a';
}

function unseed() {
  store.threads = [];
  store.activeId = null;
}

describe('the opening state', () => {
  unseed();
  const html = page();

  it('asks about the period by name, with its trades and net', () => {
    expect(html).toContain('What do you want to know about August?');
    const tone = facts.netPnl < 0 ? 'text-loss-bright' : 'text-profit-bright';
    expect(html).toContain(`48 trades · <span class="${tone}">${formatCurrency(facts.netPnl)}</span>`);
  });

  it('leads each starting point with its figure and the rest of its sentence', () => {
    const findings = openingFindings(facts).slice(0, 3);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      if (f.figure) expect(html, f.headline).toContain(f.figure);
      expect(html, f.headline).toContain(f.lead);
    }
    expect(html).toContain('Ask about this');
  });

  it('says what it will not do before anything is asked, on both layouts', () => {
    expect(html).toContain('It never tells you what to trade next.');
    expect(html).toContain('reviews only, no trade advice');
  });

  it('gives a phone its title, the history and new-chat buttons, and the questions left', () => {
    expect(html).toContain('>Ask</h1>');
    expect(html).toContain('aria-label="Conversations"');
    expect(html).toContain('aria-label="New chat"');
    expect(html).toContain('34 left today');
  });

  it('puts the box to type in under it, with the allowance beside the hint', () => {
    expect(html).toContain('placeholder="Ask about August…"');
    expect(html).toContain('Enter to send · Shift + Enter for a new line');
    expect(html).toContain('34 questions left today');
  });
});

describe('what it can see', () => {
  unseed();
  const html = page();

  it('names the journal, the period, the trades and the rules it was handed', () => {
    expect(html).toContain('What it can see');
    expect(html).toContain('Primary journal');
    expect(html).toContain('>August 2026<');
    expect(html).toContain('Max 3 trades a day');
    expect(html).toContain('Stop at -$500 on the day');
  });

  it('shows the notes opt-in off until the trader turns it on', () => {
    // Opt-in, as it has always been: the switch and the header button both start off.
    expect(html).toMatch(/role="switch" aria-checked="false" aria-label="Let it read my trade notes"/);
    expect(html).toContain('Notes off');
  });

  it('lists no rules where none were handed over, as in the all-journals view', () => {
    view.allJournals = true;
    try {
      const all = paint(createElement(AssistantContent, { periods, onBack: noop }));
      expect(all).toContain('All journals');
      expect(all).toContain('None it can check against');
      expect(all).not.toContain('Max 3 trades a day');
    } finally {
      view.allJournals = false;
    }
  });

  it('keeps the line about advice at the foot of the rail', () => {
    expect(html).toContain("It reads the figures your journal already computed, so it can't disagree with your dashboard.");
  });
});

describe('a conversation', () => {
  seed();
  const html = page();
  unseed();

  it('reads the conversation in a column, not across the whole panel', () => {
    // The scrolling conversation itself, not just the composer under it.
    expect(html).toMatch(/overflow-y-auto"><div class="mx-auto flex w-full max-w-3xl/);
  });

  it('draws the answer with its headline, its table and its bullets', () => {
    expect(html).toContain('Mostly the trades after your third of the day.');
    expect(html).not.toContain('**Mostly');
    expect(html).toContain('<table');
    expect(html).not.toContain('|---|');
    expect(html).toContain('Every red day ran past three trades.');
  });

  it('says under the answer which period it saw, and that it gives no advice', () => {
    expect(html).toContain('From your journal · <span class="lg:hidden">Aug 2026</span><span class="hidden lg:inline">August 2026</span> · 48 trades · reviews only, no trade advice');
  });

  it('offers follow-ups under the latest answer, and none it has already asked', () => {
    // Not tailored to the answer — that would take the model — but each one is a question about
    // this period it can answer from its figures, less the ones this conversation has asked.
    expect(suggestions.length).toBeGreaterThan(1);
    const after = html.slice(html.indexOf('Every red day ran past three trades.'));
    expect(after).toContain(`>${suggestions[1].label}</button>`);
    expect(after).not.toContain(`>${asked.label}</button>`);
  });

  it('copies, and draws no button with nothing behind it', () => {
    // The design also draws Pin, a pinned-answers card and thumbs up/down. Nothing keeps a pin or
    // records a rating, so none of them is drawn.
    expect(html).toContain('>Copy');
    for (const dead of ['>Pin<', 'Pinned answers', '👍', '👎']) expect(html, dead).not.toContain(dead);
  });

  it('moves the starting points to the rail once the middle is a conversation', () => {
    expect(html).toContain('Starting points');
    expect(html).toContain('Ask about this');
  });

  it('gives a phone the conversation’s own bar, the way back, and its options', () => {
    expect(html).toContain('aria-label="Back to Ask"');
    expect(html).toContain('Aug 2026 · 48 trades');
    expect(html).toContain('aria-label="Conversation options"');
  });

  it('groups the history by when, each row with its period and length', () => {
    const groups = ['>Today<', '>This week<', '>Earlier<'].map((label) => html.indexOf(label));
    expect(groups.every((at) => at > -1)).toBe(true);
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(html).toContain('Aug 2026 · 2 messages');
    // A conversation saved before answers recorded their period just counts its messages.
    expect(html).toContain('>1 message<');
    expect(html).toContain('aria-current="true"');
  });
});

describe('no trades in the period', () => {
  it('says so, and offers the longer periods instead of a box to type in', () => {
    const html = paint(
      createElement(AssistantContent, {
        periods: [
          { scope: 'month' as const, label: 'October 2026', trades: [] },
          { scope: 'year' as const, label: '2026', trades: [] },
        ],
        onBack: noop,
      }),
    );
    expect(html).toContain('No trades in October 2026 yet');
    expect(html).not.toContain('aria-label="Ask about your trading"');
  });
});

describe('the dock on the Overview', () => {
  it('still opens on its findings and questions', () => {
    unseed();
    const html = paint(createElement(AssistantPanel, { periods, rules, bare: true }));
    expect(html).toContain('Ask about your trading');
    expect(html).toContain('Reviewing <span class="text-text-primary font-medium">August 2026</span>');
    expect(html).toContain('Or ask:');
    expect(html).toContain('aria-label="Ask about your trading"');
  });

  it('still shows the conversation it shares with the page', () => {
    seed();
    const html = paint(createElement(AssistantPanel, { periods, rules, bare: true }));
    unseed();
    expect(html).toContain(asked.question);
    expect(html).toContain('Mostly the trades after your third of the day.');
    expect(html).toContain('aria-label="New chat"');
  });

  it('still opens as a dialog from the corner', () => {
    const html = paint(createElement(AssistantDock, { open: true, onOpenChange: noop, periods, rules, showLauncher: true }));
    expect(html).toContain('role="dialog" aria-label="Trading assistant"');
    expect(html).toContain('Ask about your trading');
  });
});
