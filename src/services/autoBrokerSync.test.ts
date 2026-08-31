import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Trade } from '../types';
import { runAutoSync } from './autoBrokerSync';

/**
 * These exist because this sync duplicated trades in production once already, and it is the one
 * path in the app that writes to a trader's journal with nobody watching it happen.
 */

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
  });
});

const existing = (sourceId: string, over: Partial<Trade> = {}): Trade =>
  ({ id: `t-${sourceId}`, date: '2026-07-14', symbol: 'SPY', pnl: -100, sourceId, ...over }) as Trade;

const incoming = (sourceId: string | undefined, over: Partial<Trade> = {}): Partial<Trade> => ({
  date: '2026-07-14',
  symbol: 'SPY',
  pnl: -100,
  sourceId,
  ...over,
});

const status = (accountIds: string[]) => () =>
  Promise.resolve({ registered: true, accounts: accountIds.map((id) => ({ id })) } as never);

describe('runAutoSync deduplication', () => {
  it('does not re-import a trade the journal already has', async () => {
    const result = await runAutoSync({
      uid: 'u1',
      existingTrades: [existing('abc')],
      fetchStatus: status(['acc1']),
      syncAccount: () => Promise.resolve({ trades: [incoming('abc')] }),
    });
    expect(result?.newTrades).toHaveLength(0);
  });

  it('drops trades with no sourceId instead of importing them', async () => {
    // The duplicate generator. A row with no sourceId can never be recognised on a later sync, so
    // importing it means a fresh copy every time the app is opened — forever, unattended.
    const result = await runAutoSync({
      uid: 'u1',
      existingTrades: [],
      fetchStatus: status(['acc1']),
      syncAccount: () => Promise.resolve({ trades: [incoming(undefined)] }),
    });
    expect(result?.newTrades).toHaveLength(0);
  });

  it('imports the same unidentifiable trade zero times across repeated syncs', async () => {
    let journal: Trade[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await runAutoSync({
        uid: 'u1',
        existingTrades: journal,
        fetchStatus: status(['acc1']),
        syncAccount: () => Promise.resolve({ trades: [incoming(undefined), incoming('real')] }),
      });
      journal = [...journal, ...(result?.newTrades ?? [])];
    }
    // Five opens of the app: the identifiable trade lands once, the unidentifiable one never.
    expect(journal).toHaveLength(1);
    expect(journal[0].sourceId).toBe('real');
  });

  it('recognises a re-imported trade by its execution fingerprint when the sourceId changed', async () => {
    // Rows imported before the id bug was fixed carry sourceIds with a random component that will
    // never match again. Without the fingerprint check every one of them returns as "new" on the
    // first sync after the fix.
    const old = existing('snaptrade_acc1_1699999999_0_random', {
      quantity: 2,
      tradePrice: 400,
      exitPrice: 395,
    });
    const result = await runAutoSync({
      uid: 'u1',
      existingTrades: [old],
      fetchStatus: status(['acc1']),
      syncAccount: () =>
        Promise.resolve({
          trades: [incoming('stable-id', { quantity: 2, tradePrice: 400, exitPrice: 395 })],
        }),
    });
    expect(result?.newTrades).toHaveLength(0);
  });

  it('does not add the same round trip twice when two accounts both report it', async () => {
    const result = await runAutoSync({
      uid: 'u1',
      existingTrades: [],
      fetchStatus: status(['acc1', 'acc2']),
      syncAccount: () => Promise.resolve({ trades: [incoming('shared')] }),
    });
    expect(result?.newTrades).toHaveLength(1);
  });

  it('still imports genuinely new trades', async () => {
    const result = await runAutoSync({
      uid: 'u1',
      existingTrades: [existing('old')],
      fetchStatus: status(['acc1']),
      syncAccount: () => Promise.resolve({ trades: [incoming('old'), incoming('new', { pnl: 42 })] }),
    });
    expect(result?.newTrades).toHaveLength(1);
    expect(result?.newTrades[0].sourceId).toBe('new');
  });

  it('gives every imported trade a distinct id', async () => {
    const result = await runAutoSync({
      uid: 'u1',
      existingTrades: [],
      fetchStatus: status(['acc1']),
      syncAccount: () =>
        Promise.resolve({
          trades: [incoming('a', { pnl: 1 }), incoming('b', { pnl: 2 }), incoming('c', { pnl: 3 })],
        }),
    });
    const ids = (result?.newTrades ?? []).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not start a cooldown when every account failed', async () => {
    // Otherwise a total outage buys four hours of not retrying, and the trader sits there stale.
    const result = await runAutoSync({
      uid: 'u1',
      existingTrades: [],
      fetchStatus: status(['acc1']),
      syncAccount: () => Promise.reject(new Error('broker down')),
    });
    expect(result?.syncedAccounts).toBe(0);
    expect(result?.failedAccounts).toBe(1);
    expect(storage.get('tc-last-broker-sync:u1')).toBeUndefined();
  });
});
