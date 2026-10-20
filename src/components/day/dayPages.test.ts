import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Trade } from '../../types';

/*
 * The day page and the Trades page, painted with the contexts mocked.
 *
 * What matters most here is what they must never do: a note box that can be typed into before the
 * note has loaded (which is how an empty box got saved over a real note), a second place that writes
 * a trade's note, or a rule verdict that disagrees with the rule.
 */

vi.mock('../../lib/firebase', () => ({ isFirebaseConfigured: () => false, getFirebaseDb: () => ({}), getFirebaseAuth: () => ({ currentUser: null }) }));
vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 't@example.com' }, firebaseEnabled: true, loading: false }),
}));
vi.mock('../../context/useSettings', () => ({
  useSettings: () => ({
    settings: {
      currency: 'USD',
      accounts: [{ id: 'default', name: 'Primary journal' }],
      activeAccountId: 'default',
      tradingRules: { enabled: true, maxTradesPerDay: 3, maxDailyLoss: 500, maxConsecutiveLosses: 3 },
    },
    viewingAllJournals: false,
  }),
}));

const { DayContent } = await import('./DayContent');
const { TradesContent } = await import('../trades/TradesContent');

const paint = (el: Parameters<typeof renderToString>[0]) =>
  renderToString(el).replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
const noop = () => undefined;

let n = 0;
const t = (pnl: number, over: Partial<Trade> = {}): Trade =>
  ({ id: `snaptrade_a_${String(n++).padStart(4, '0')}`, date: '2026-09-17', symbol: 'SPY', pnl, ...over }) as Trade;
// Sep 17 from the mockup.
const sep17 = () => [t(160, { notes: 'Opening range held.' }), t(-215), t(-204), t(104), t(-296), t(-213.04)];

const day = (layout: 'page' | 'sheet', trades = sep17()) =>
  paint(
    createElement(DayContent, {
      layout,
      date: '2026-09-17',
      trades,
      ruleTrades: trades,
      onBack: noop,
      onOpenDay: noop,
      onEdit: noop,
      onDelete: noop,
      onAddTrade: noop,
    }),
  );

describe('the day page', () => {
  it('reads the day the way the rules do, naming where each line was crossed', () => {
    const html = day('page');
    expect(html).toContain('Max 3 trades a day');
    expect(html).toContain('Took 6. Past it from the 4th trade.');
    expect(html).toContain('Stop at -$500 on the day');
    expect(html).toContain('Finished at -$664.04, past it on the 6th trade.');
    expect(html).toContain('broke 2 of 3');
  });

  it('marks the cap in the list and says what the trades after it cost', () => {
    const html = day('page');
    expect(html.replace(/<[^>]+>/g, '')).toContain('Your cap is 3 trades. The three below cost $405.04.');
    expect(html).toContain('If you had stopped at three');
  });

  it('never lets a note be typed before it has loaded', () => {
    // The first paint is before the load: the box is disabled, so nothing typed can be saved over
    // the note that is still on its way.
    for (const layout of ['page', 'sheet'] as const) {
      const box = day(layout).match(/<textarea[^>]*aria-label="Notes for this day"[^>]*>/)?.[0] ?? '';
      expect(box, layout).toContain('disabled=""');
    }
  });

  it('keeps the discipline rating shut until the note has loaded too', () => {
    const html = day('sheet');
    const radios = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(5);
    for (const r of radios) expect(r).toContain('disabled=""');
  });

  it('saves notes only through the guarded hook, with the same service as before', () => {
    const page = readFileSync('src/components/day/DayContent.tsx', 'utf8');
    expect(page).toContain('useDayNote(date)');
    expect(page).not.toContain('saveDayNote');
    const hook = readFileSync('src/hooks/useDayNote.ts', 'utf8');
    expect(hook).toContain('pendingDayNoteWrite');
    expect(hook).toContain('shouldSaveDayNote');
  });

  it('keeps edit and delete on every trade, since the trade form has no delete of its own', () => {
    const html = day('page');
    expect(html.match(/aria-label="Edit trade"/g)).toHaveLength(6);
    expect(html.match(/aria-label="Delete trade"/g)).toHaveLength(6);
  });

  it('paints an empty day without dividing by nothing', () => {
    const html = day('page', []);
    expect(html).toContain('No trades this day');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});

describe('the Trades page', () => {
  const trades = [...sep17(), t(180, { symbol: 'CVX', date: '2026-09-18', assetType: 'stock' })];
  const page = (list = trades) =>
    paint(
      createElement(TradesContent, {
        trades: list,
        ruleTrades: list,
        ruleDates: new Set(['2026-09-17']),
        year: 2026,
        month: 8,
        onPrevMonth: noop,
        onNextMonth: noop,
        onPrevYear: noop,
        onNextYear: noop,
        onOpenDay: noop,
        onEdit: noop,
        onDelete: noop,
      }),
    );

  it('sums up what is listed, and offers the untagged trades', () => {
    const html = page();
    expect(html).toContain('Biggest loss');
    expect(html).toContain('1 of 2');
    expect(html).toContain('7 trades have no setup');
  });

  it('flags the trades past the cap', () => {
    // Sep 17 alone, so it is the newest day and drawn open.
    expect(page(sep17()).match(/title="Past your 3-trade cap"/g)).toHaveLength(3);
  });

  it('opens only the newest day, and folds the others to their header', () => {
    const html = page();
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
    expect(html.replace(/<[^>]+>/g, '')).toContain('Thu Sep 17 · 6 trades · 2 won 4 lost · broke a rule');
    // The CVX trade on Sep 18 is listed; none of Sep 17's six are.
    expect(html.match(/<tr[^>]*aria-selected/g)).toHaveLength(1);
    expect(html).toContain('Expand all days');
  });

  it('shows a trade’s note without a box to type in — the trade form is the one place it is edited', () => {
    const html = page();
    // The newest day is listed first, so the selected trade is the CVX share trade with no note.
    expect(html).toContain('No note on this trade.');
    expect(html).not.toContain('<textarea');
  });
});
