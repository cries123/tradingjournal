import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Trade } from '../../types';

/*
 * Jay: "when people go to trades and click on a trade it should show them trade info, like their
 * note etc not go to the day worth of trades."
 *
 * The trade log on the Overview (a table on desktop, the Trades tab on a phone) opened the day for
 * every row. A trade's row now opens that trade; the day's own row still opens the day.
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

const { TradeSheet } = await import('./TradeSheet');

const paint = (el: Parameters<typeof renderToString>[0]) =>
  renderToString(el).replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const noop = () => undefined;

let n = 0;
const t = (pnl: number, over: Partial<Trade> = {}): Trade =>
  ({ id: `snaptrade_a_${String(n++).padStart(4, '0')}`, date: '2026-09-17', symbol: 'SPY', pnl, quantity: 4, tradePrice: 1.45, exitPrice: 1.25, ...over }) as Trade;

const day = [t(160), t(-215), t(-204), t(-83.54, { notes: 'Chased the bounce after my third. Should have stopped.' })];
const sheet = (trade: Trade, ruleTrades: Trade[] = day) =>
  paint(createElement(TradeSheet, { trade, ruleTrades, onClose: noop, onOpenDay: noop, onEdit: noop, onDelete: noop }));

describe('the trade sheet', () => {
  it('shows the trade itself — its note, its fills and where it sat in the day', () => {
    const text = sheet(day[3]);
    expect(text).toContain('Chased the bounce after my third. Should have stopped.');
    expect(text).toContain('-$83.54');
    expect(text).toContain('Entry 1.45');
    expect(text).toContain('Exit 1.25');
    expect(text).toContain('4th trade of the day');
    expect(text).toContain('4th trade of the day. Your cap is 3.');
  });

  it('keeps the day one tap away, and edit and delete beside it', () => {
    const text = sheet(day[0]);
    for (const action of ['Open day', 'Edit', 'Delete']) expect(text).toContain(action);
    expect(text).toContain('No note on this trade.');
  });

  it('does not invent a place in the day for a trade from another journal', () => {
    // In the all-journals view a paper trade is not in the active journal's day: tradeContext would
    // call it the 1st, and its cap flag and running total would be about someone else's day.
    const text = sheet(t(50, { date: '2026-09-17', id: 'paper_1' }));
    expect(text).not.toContain('trade of the day');
    expect(text).not.toContain('day went from');
  });

  it('shows the note without a box to type in: the trade form is the one place a note is changed', () => {
    expect(renderToString(createElement(TradeSheet, { trade: day[3], ruleTrades: day, onClose: noop, onOpenDay: noop, onEdit: noop, onDelete: noop }))).not.toContain('<textarea');
  });
});

describe('the trade log', () => {
  const log = readFileSync('src/components/overview/TradeLog.tsx', 'utf8');

  it('opens the trade from a trade’s row, on desktop and on a phone', () => {
    expect(log.match(/onClick=\{\(\) => openTrade\(trade\)\}/g)).toHaveLength(2);
  });

  it('still opens the day from the day’s own row, on desktop and on a phone', () => {
    expect(log.match(/onClick=\{\(\) => onDayClick\(date\)\}/g)).toHaveLength(2);
  });

  it('is handed the sheet by the app, through the Overview', () => {
    const app = readFileSync('src/pages/JournalApp.tsx', 'utf8');
    expect(app).toContain('onTradeClick={(trade) => setOpenTradeId(trade.id)}');
    expect(app).toContain('<TradeSheet');
    expect(readFileSync('src/components/DashboardView.tsx', 'utf8')).toContain('onTradeClick={onTradeClick}');
  });
});
