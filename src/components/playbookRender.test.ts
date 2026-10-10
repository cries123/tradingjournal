import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Trade } from '../types';
import type { Strategy } from '../types/strategy';

/*
 * The playbook where a trader meets it: the boxes on the trade form and the rows in Settings.
 *
 * renderToString runs the real components with only the settings context faked, so a strategy with
 * rules is checked to actually produce checkboxes — the half of the feature a unit test of
 * ticksFor cannot see.
 */

const { strategies } = vi.hoisted(() => ({
  strategies: [] as Strategy[],
}));

vi.mock('../context/useSettings', () => ({
  useSettings: () => ({
    settings: { strategies, setupTags: ['ORB'], defaultSymbol: 'SPY' },
    addStrategy: () => undefined,
    removeStrategy: () => undefined,
    updateStrategy: () => undefined,
  }),
}));

import { TradeModal } from './TradeModal';
import { PlaybookSection } from './settings/PlaybookSection';

/** renderToString puts `<!-- -->` between adjacent text nodes; strip markup to read the words. */
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const ORB: Strategy = { id: 'orb', name: 'Opening range break', criteria: ['Above VWAP', 'Waited for the retest', 'Size within plan'], defaultTags: [] };

function renderModal(trade: Trade) {
  return renderToString(
    createElement(TradeModal, { trade, onClose: () => undefined, onSave: async () => undefined }),
  );
}

describe('the trade form', () => {
  it('shows a ticked trade’s rules as checkboxes, with the counted score in place of the typed box', () => {
    strategies.splice(0, strategies.length, ORB);
    const html = renderModal({
      id: 't1',
      date: '2026-10-01',
      symbol: 'SPY',
      pnl: 100,
      strategyId: 'orb',
      checklistScore: 67,
      checklist: [
        { rule: 'Above VWAP', met: true },
        { rule: 'Waited for the retest', met: true },
        { rule: 'Size within plan', met: false },
      ],
    });

    const words = text(html);
    expect(words).toContain('Playbook — tick what you actually did · 67%');
    expect(words).toContain('Waited for the retest');
    // Two ticked, one not — the record, as it was saved.
    expect(html.match(/type="checkbox"[^>]*checked/g)).toHaveLength(2);
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    // Outside the collapsed Advanced section, so it is on screen the moment the form opens.
    expect(html.indexOf('Playbook')).toBeLessThan(html.indexOf('Advanced details'));
  });

  it('offers the rules of a strategy picked on a trade that was never ticked', () => {
    strategies.splice(0, strategies.length, ORB);
    const html = renderModal({ id: 't2', date: '2026-10-01', symbol: 'SPY', pnl: -40, strategyId: 'orb' });
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/type="checkbox"[^>]*checked/g)).toBeNull();
    expect(text(html)).toContain('· 0%');
  });

  it('says where the rules come from when the strategy has none', () => {
    strategies.splice(0, strategies.length, { ...ORB, criteria: [] });
    const html = renderModal({ id: 't3', date: '2026-10-01', symbol: 'SPY', pnl: 10, strategyId: 'orb' });
    expect(text(html)).toContain('Settings → Strategy playbook');
    expect(html).not.toContain('type="checkbox"');
  });
});

describe('the Settings playbook', () => {
  it('lists each strategy with how many rules it has', () => {
    strategies.splice(0, strategies.length, ORB, { id: 'x', name: 'Fade', criteria: [], defaultTags: [] });
    const out = text(renderToString(createElement(PlaybookSection)));

    expect(out).toContain('Opening range break');
    expect(out).toContain('3 rules');
    expect(out).toContain('No rules yet');
  });
});
