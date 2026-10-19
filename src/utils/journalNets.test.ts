import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { journalNets } from './journalNets';

const t = (date: string, pnl: number, accountId?: string): Trade => ({ id: `${date}-${pnl}-${accountId}`, date, symbol: 'SPY', pnl, accountId });

describe('journalNets', () => {
  it('adds up each journal on its own, over every month and year it has', () => {
    // The figure beside a journal's name is its overall P&L, not the month on screen.
    const nets = journalNets([
      t('2026-09-02', 100, 'default'),
      t('2026-09-30', -40, 'default'),
      t('2026-10-01', 15, 'default'),
      t('2025-03-11', -200, 'default'),
      t('2026-09-15', 25, 'paper'),
      t('2026-08-31', 5, 'paper'),
    ]);
    expect(nets.get('default')).toBe(-125);
    expect(nets.get('paper')).toBe(30);
  });

  it('files a trade with no journal where the journal screens show it', () => {
    // Trades from before journals existed carry no accountId; they live in the default journal.
    expect(journalNets([t('2026-09-02', 50)]).get('default')).toBe(50);
  });

  it('leaves out a journal with no trades rather than calling it flat', () => {
    const nets = journalNets([t('2026-09-02', 50, 'default')]);
    expect(nets.has('paper')).toBe(false);
  });

  it('keeps a journal that netted exactly zero, because it was traded', () => {
    expect(journalNets([t('2026-09-02', 50, 'default'), t('2026-09-03', -50, 'default')]).get('default')).toBe(0);
  });
});
