import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { autoSyncTradeId, brokerTradeIdPrefix, isBrokerTradeIdFor, manualSyncTradeId } from './brokerTradeIds';
import { syncStartDate } from './syncWindow';
import type { Trade } from '../types';

/*
 * The id is the only place a trade remembers which brokerage account it came from, and three
 * places have to agree on it: the two importers that write it and the window that reads it. They
 * agreed by convention until addTrades replaced the manual importer's id with a UUID on the way to
 * the write — and then the window, tested only against ids it built itself, never matched a real
 * one. These tests run the ids through the reader, and through the write path's rule.
 */

describe('the broker trade id', () => {
  it('is recognised by the window reader whichever importer wrote it', () => {
    expect(isBrokerTradeIdFor(manualSyncTradeId('acct-1', 1760000000000, 3), 'acct-1')).toBe(true);
    expect(isBrokerTradeIdFor(autoSyncTradeId('acct-1', 1760000000000, 3), 'acct-1')).toBe(true);
  });

  it('is for one account only', () => {
    expect(isBrokerTradeIdFor(manualSyncTradeId('acct-1', 1, 0), 'acct-10')).toBe(false);
    expect(isBrokerTradeIdFor(manualSyncTradeId('acct-10', 1, 0), 'acct-1')).toBe(false);
    expect(isBrokerTradeIdFor(crypto.randomUUID(), 'acct-1')).toBe(false);
    expect(isBrokerTradeIdFor(undefined, 'acct-1')).toBe(false);
  });

  it('collates in import order on a busy day', () => {
    const ids = Array.from({ length: 12 }, (_, i) => manualSyncTradeId('a', 5, i));
    expect([...ids].sort()).toEqual(ids);
    const auto = Array.from({ length: 12 }, (_, i) => autoSyncTradeId('a', 5, i));
    expect([...auto].sort()).toEqual(auto);
  });

  it('narrows the next sync once a manual import has landed', () => {
    // The whole point. A journal holding one manually synced trade must produce a window, not undefined.
    const trade = {
      id: manualSyncTradeId('acct-1', 1760000000000, 0),
      date: '2026-10-01',
      symbol: 'SPY',
      pnl: 10,
      sourceId: 'snaptrade:o:c',
    } as Trade;
    expect(syncStartDate([trade], 'acct-1', new Date(2026, 9, 15))).toBe('2026-09-17');
  });
});

describe('the write path keeps the id it is handed', () => {
  const src = readFileSync('src/hooks/useTrades.ts', 'utf8');

  it('only mints an id for a trade that has none', () => {
    expect(src).toContain('id: trade.id ?? crypto.randomUUID()');
    expect(src).not.toMatch(/id: crypto\.randomUUID\(\),/);
  });

  it('has the manual importer build its id from the shared scheme', () => {
    const screen = readFileSync('src/components/brokers/BrokerConnectContent.tsx', 'utf8');
    expect(screen).toContain('manualSyncTradeId(account.id, stamp, i)');
    expect(screen).not.toContain('`snaptrade_${account.id}_');
  });

  it('has the morning importer on the same scheme', () => {
    const auto = readFileSync('server/autoSync.ts', 'utf8');
    expect(auto).toContain("export { autoSyncTradeId } from '../src/utils/brokerTradeIds';");
  });

  it('has the reader on the same prefix, not its own copy of it', () => {
    const window = readFileSync('src/utils/syncWindow.ts', 'utf8');
    expect(window).toContain('isBrokerTradeIdFor(trade.id, snaptradeAccountId)');
    expect(window).not.toContain('`snaptrade_${snaptradeAccountId}_`');
    expect(brokerTradeIdPrefix('x')).toBe('snaptrade_x_');
  });
});
