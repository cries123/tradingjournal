import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

/*
 * The all-journals view in the two places a trader meets it: the journal picker, and the trade form
 * that has to ask where a new trade goes once no single journal is on screen.
 */

type SettingsState = {
  accounts: { id: string; name: string }[];
  activeAccountId: string;
  viewing: boolean;
  canView: boolean;
};

const state: { current: SettingsState } = {
  current: { accounts: [], activeAccountId: 'schwab', viewing: false, canView: false },
};

vi.mock('../context/useSettings', () => ({
  useSettings: () => ({
    settings: {
      accounts: state.current.accounts,
      activeAccountId: state.current.activeAccountId,
      defaultSymbol: 'SPY',
      setupTags: [],
      strategies: [],
      currency: 'USD',
    },
    viewingAllJournals: state.current.viewing,
    canViewAllJournals: state.current.canView,
    setViewAllJournals: () => undefined,
    setActiveAccount: () => undefined,
    addAccount: () => true,
    journalLimit: 3,
    canAddJournal: true,
  }),
}));

import { AllJournalsNote, AllJournalsOption } from './AllJournalsOption';
import { TradeModal } from './TradeModal';

const TWO = [
  { id: 'schwab', name: 'Schwab' },
  { id: 'robinhood', name: 'Robinhood' },
];
const noop = () => undefined;
const paint = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, '');

describe('the All journals option', () => {
  it('is not offered with a single journal, where there is nothing to add together', () => {
    state.current = { accounts: [TWO[0]], activeAccountId: 'schwab', viewing: false, canView: false };
    expect(paint(createElement(AllJournalsOption, { variant: 'row' }))).toBe('');
  });

  it('is shown locked on a plan without it, naming the plan that has it', () => {
    state.current = { accounts: TWO, activeAccountId: 'schwab', viewing: false, canView: false };
    const html = paint(createElement(AllJournalsOption, { variant: 'row' }));
    expect(html).toContain('All journals');
    expect(html).toContain('Silver');
    expect(html).not.toContain('aria-pressed');
  });

  it('is a toggle on a plan with it, pressed while the view is on', () => {
    state.current = { accounts: TWO, activeAccountId: 'schwab', viewing: true, canView: true };
    expect(paint(createElement(AllJournalsOption, { variant: 'chip' }))).toContain('aria-pressed="true"');
  });

  it('says where new trades go while every journal is shown', () => {
    state.current = { accounts: TWO, activeAccountId: 'robinhood', viewing: true, canView: true };
    expect(paint(createElement(AllJournalsNote))).toContain('New trades go to Robinhood');
    state.current = { ...state.current, viewing: false };
    expect(paint(createElement(AllJournalsNote))).toBe('');
  });
});

describe('the wiring a server render cannot reach', () => {
  /*
   * Source assertions, as saveWaits does, for the parts that live in hooks and context: there is no
   * DOM here to drive a picker click or a save. tradesInView and allJournalsView are tested on their
   * own; these pin that the app actually hands them the view.
   */
  const code = (path: string) =>
    readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('has every screen read the view, not the raw setting', () => {
    expect(code('src/hooks/useTrades.ts')).toContain(
      'tradesInView(combinedTrades, settings.activeAccountId, viewingAllJournals)',
    );
  });

  it('leaves the all-journals view when a single journal is picked', () => {
    expect(code('src/context/SettingsContext.tsx')).toContain(
      'persist({ ...settings, activeAccountId: id, viewAllJournals: false })',
    );
  });

  it('files a new trade in the journal the form asked about', () => {
    expect(code('src/components/TradeModal.tsx')).toContain(
      'accountId: trade ? trade.accountId : askJournal ? journalId : undefined,',
    );
  });

  it('gives the assistant no rules while every journal is shown', () => {
    const app = code('src/pages/JournalApp.tsx');
    expect(app).toContain('const assistantRules = viewingAllJournals ? undefined : settings.tradingRules;');
    expect(app).not.toContain('rules={settings.tradingRules}');
  });
});

describe('the trade form in the all-journals view', () => {
  const form = (trade?: object) =>
    paint(createElement(TradeModal, { trade: trade as never, onClose: noop, onSave: async () => undefined }));

  it('asks which journal a new trade goes into, starting on the active one', () => {
    state.current = { accounts: TWO, activeAccountId: 'robinhood', viewing: true, canView: true };
    const html = form();
    expect(html).toContain('>Journal<');
    expect(html).toMatch(/<option value="robinhood" selected="">Robinhood<\/option>/);
  });

  it('does not ask with one journal on screen', () => {
    state.current = { accounts: TWO, activeAccountId: 'schwab', viewing: false, canView: true };
    expect(form()).not.toContain('>Journal<');
  });

  it('does not ask when editing — a trade keeps the journal it is in', () => {
    state.current = { accounts: TWO, activeAccountId: 'schwab', viewing: true, canView: true };
    const html = form({ id: 't1', date: '2026-07-14', symbol: 'SPY', pnl: 10, accountId: 'robinhood' });
    expect(html).not.toContain('>Journal<');
  });
});
