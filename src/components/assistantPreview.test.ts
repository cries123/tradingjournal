import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Trade } from '../types';
import { tierHas, type Feature, type Tier } from '../config/tiers';

/*
 * The assistant on a plan without it.
 *
 * Silver used to get a padlock over a blurred chat. It now gets the opening screen for real — the
 * findings are computed in the browser and cost nothing — with only the chat behind Gold. Free keeps
 * the padlock: the findings are the Performance screen's analysis, which Free does not have.
 */

const plan: { tier: Tier } = { tier: 'silver' };

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));
vi.mock('../context/useEntitlement', () => ({
  useEntitlement: () => ({
    tier: plan.tier,
    loaded: true,
    loading: false,
    marketReplayLive: false,
    has: (f: Feature) => tierHas(plan.tier, f),
    limits: { aiMessagesPerDay: plan.tier === 'gold' ? 15 : 0 },
    usage: { aiMessagesUsed: 0, aiCredits: 0 },
    noteUsage: () => undefined,
  }),
}));
vi.mock('../context/useSettings', () => ({
  useSettings: () => ({ settings: { currency: 'USD', tradingRules: { enabled: false } } }),
}));
// Signed in: the padlock offers a Gold trial now that Gold carries one, and that button reads auth.
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'trader@example.com' }, firebaseEnabled: true, loading: false }),
}));
// A saved conversation, which a locked preview must not show or continue.
vi.mock('../hooks/useAssistantThreads', () => ({
  useAssistantThreads: () => ({
    threads: [{ id: 'a', title: 'Old question', createdAt: 1, updatedAt: 1, messages: [] }],
    activeId: 'a',
    messages: [
      { role: 'user', content: 'An old question from when I was on Gold', at: 1 },
      { role: 'assistant', content: 'An old answer.', at: 2 },
    ],
    append: () => undefined,
    rollbackTo: () => undefined,
    startNew: () => undefined,
    selectThread: () => undefined,
    deleteThread: () => undefined,
  }),
}));

import { InAppProvider } from './layout/PageFrame';
import { LockedFeature } from './plan/LockedFeature';
import { AssistantContent } from './analytics/AssistantContent';

let n = 0;
const trade = (pnl: number, date = '2026-07-14'): Trade =>
  ({ id: `t${n++}`, date, symbol: 'SPY', side: 'long', pnl, quantity: 1 + (n % 3) }) as Trade;
// Enough losing size on the losers for the opening findings to have something to say.
const trades = Array.from({ length: 40 }, (_, i) => trade(i % 2 ? -90 - i : 50 + i, `2026-07-${String((i % 20) + 1).padStart(2, '0')}`));
const periods = [{ scope: 'year' as const, label: '2026', trades }];
const noop = () => undefined;

/** The assistant screen as JournalApp mounts it. */
const screen = (tier: Tier) => {
  plan.tier = tier;
  return renderToString(
    createElement(
      InAppProvider,
      null,
      createElement(LockedFeature, {
        feature: 'aiAssistant',
        title: 'The trading assistant is a paid feature',
        description: 'x',
        previewFeature: 'performanceAnalytics',
        preview: createElement(AssistantContent, { periods, onBack: noop, chatLocked: true }),
        children: createElement(AssistantContent, { periods, onBack: noop }),
      }),
    ),
  )
    .replace(/<!-- -->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'");
};

describe('the assistant on Silver', () => {
  const html = screen('silver');

  it('shows the opening screen for real, not a padlock', () => {
    expect(html).toContain('What do you want to know about 2026?');
    expect(html).not.toContain('The trading assistant is a paid feature');
    expect(html).not.toContain('blur-[2px]');
  });

  it('turns every way of asking into the upgrade, naming the plan that answers', () => {
    expect(html).toContain('Ask follow-up questions on Gold');
    expect(html).toContain('Upgrade to Gold');
    // No message box to type into and no send button.
    expect(html).not.toContain('aria-label="Ask about your trading"');
    expect(html).not.toContain('aria-label="Send"');
  });

  it('labels the findings with where they can be asked', () => {
    expect(html).toContain('Starting points');
    expect(html).toContain('Ask on Gold');
    expect(html).not.toContain('Ask about this');
  });

  it('does not show or continue a saved conversation', () => {
    expect(html).not.toContain('An old question from when I was on Gold');
    // No conversations column, and no way to it on a phone: the plan card stands where it was.
    expect(html).not.toContain('Search conversations');
    expect(html).not.toContain('aria-label="Conversations"');
    expect(html).toContain('Ask it anything on Gold');
  });

  it('leaves out the controls that only change what the model is sent', () => {
    expect(html).not.toContain('Compare against another period');
    expect(html).not.toContain('Let it read my trade notes');
  });
});

describe('a click on Silver', () => {
  it('opens the upgrade and never reaches the send', async () => {
    // Clicks need a DOM; this pins the one path every finding and question goes through. The server
    // refuses a Silver chat request anyway — this is so the screen never makes one.
    const { readFileSync } = await import('node:fs');
    const hook = readFileSync('src/hooks/useAssistantChat.ts', 'utf8');
    expect(hook).toContain('if (chatLocked) setWanted(label);\n    else void send(question);');
    // The composer goes through the same gate as every finding and chip.
    expect(hook).toMatch(/const submit = \(\) => \{[^}]*ask\(question, question\)/);
    // And the send itself is not handed to any surface, so none can call it around the gate.
    expect(hook).not.toMatch(/^\s*send,$/m);
    for (const file of ['AssistantPanel', 'AssistantContent', 'AssistantConversation', 'AssistantRail', 'AssistantHistory']) {
      expect(readFileSync(`src/components/analytics/${file}.tsx`, 'utf8'), file).not.toMatch(/\bsend\(/);
    }
  });
});

describe('the assistant on Free', () => {
  it('keeps the padlock — the findings are the Performance screen’s analysis', () => {
    const html = screen('free');
    expect(html).toContain('The trading assistant is a paid feature');
  });

  it('really takes the blurred chat behind the padlock out of reach', () => {
    // inert="" rendered nothing under React 19, leaving every control behind the card tabbable.
    expect(screen('free')).toMatch(/<div[^>]*inert=""[^>]*>|<div[^>]*\sinert[\s>]/);
  });
});

describe('the assistant on Gold', () => {
  it('is the chat, with nothing locked', () => {
    const html = screen('gold');
    expect(html).toContain('aria-label="Ask about your trading"');
    expect(html).not.toContain('Upgrade to Gold');
    expect(html).toContain('An old question from when I was on Gold');
  });
});
