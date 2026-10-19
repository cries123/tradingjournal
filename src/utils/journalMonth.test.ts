import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { journalMonthNets } from './journalMonth';

const t = (date: string, pnl: number, accountId?: string): Trade => ({ id: `${date}-${pnl}-${accountId}`, date, symbol: 'SPY', pnl, accountId });

describe('journalMonthNets', () => {
  it('adds up each journal on its own, inside the month only', () => {
    const nets = journalMonthNets(
      [t('2026-09-02', 100, 'default'), t('2026-09-30', -40, 'default'), t('2026-09-15', 25, 'paper'), t('2026-10-01', 999, 'default'), t('2026-08-31', 999, 'paper')],
      2026,
      8,
    );
    expect(nets.get('default')).toBe(60);
    expect(nets.get('paper')).toBe(25);
  });

  it('files a trade with no journal where the journal screens show it', () => {
    // Trades from before journals existed carry no accountId; they live in the default journal.
    expect(journalMonthNets([t('2026-09-02', 50)], 2026, 8).get('default')).toBe(50);
  });

  it('leaves out a journal that did not trade that month rather than calling it flat', () => {
    const nets = journalMonthNets([t('2026-09-02', 50, 'default')], 2026, 8);
    expect(nets.has('paper')).toBe(false);
  });

  it('keeps a month that netted exactly zero, because it was traded', () => {
    expect(journalMonthNets([t('2026-09-02', 50, 'default'), t('2026-09-03', -50, 'default')], 2026, 8).get('default')).toBe(0);
  });
});
