import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeEvent, type JournalEvent } from '../utils/journalEvents';

/*
 * A new connection's first few minutes, end to end through the real handler.
 *
 * SnapTrade loads a new account's transaction history in the background and answers every activity
 * request with an empty list until it has finished; the account list carries the flag. One trader
 * connected Schwab, pressed Sync at six minutes and again at fourteen, and got "no activity" both
 * times — refunded, but written into their own history as spent for nothing. Three days later the
 * same sync returned 880 activities going back a year.
 *
 * Only SnapTrade, Firestore, the usage meter and the caller's identity are faked; the handler, the
 * window planning and the matcher are the production code.
 */

const { store, account, feed, consumeDaily, refundDaily, recordJournalEvent, getAccountActivities } = vi.hoisted(() => {
  const account = {
    id: 'acct-1',
    name: 'Individual',
    institution_name: 'Charles Schwab',
    brokerage_authorization: 'auth-1',
    number: '****1234',
    sync_status: undefined as unknown,
  };
  const feed: unknown[] = [];
  return {
    store: new Map<string, Record<string, unknown>>(),
    account,
    feed,
    consumeDaily: vi.fn(async () => ({ ok: true as const, remaining: 4, source: 'daily' as const, credits: 0 })),
    refundDaily: vi.fn(async () => undefined),
    recordJournalEvent: vi.fn<(uid: string, event: JournalEvent) => Promise<void>>(async () => undefined),
    getAccountActivities: vi.fn(async () => ({ data: { data: feed, pagination: { total: feed.length } } })),
  };
});

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>('../../server/snaptradeAuth');
  return { ...actual, assertCallerUid: async () => 'user-1' };
});

vi.mock('../../server/snaptradeClient', () => ({
  SNAPTRADE_CONFIGURED: true,
  resolveBrokerSlug: async (broker: string) => broker,
  getSnaptrade: () => ({
    accountInformation: {
      listUserAccounts: async () => ({ data: [account] }),
      getAccountActivities,
    },
    authentication: { registerSnapTradeUser: async () => ({ data: { userSecret: 'fresh' } }) },
  }),
}));

vi.mock('../../server/entitlements', () => ({
  resolveAccess: async () => ({ tier: 'gold', limits: { brokers: Number.MAX_SAFE_INTEGER, syncsPerDay: 10 } }),
  readEntitlement: async () => null,
  trialUntil: () => null,
}));

vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));
vi.mock('../../server/usage', () => ({ consumeDaily, refundDaily }));
vi.mock('../../server/journalEvents', () => ({ recordJournalEvent, readJournalEvents: async () => [] }));
vi.mock('../../server/trialGuards', () => ({
  brokerageKey: () => null,
  brokerageOwner: async () => null,
  claimBrokerage: async () => undefined,
}));

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
      set: async (value: Record<string, unknown>) => {
        store.set(path, { ...(store.get(path) ?? {}), ...value });
      },
    }),
  }),
}));

import { handleBrokerConnectRequest, pullRecentActivityForUser } from '../../server/brokerConnectHandler';

const HEADERS = { authorization: 'Bearer t' };
const SYNC = { action: 'sync' as const, accountId: 'acct-1' };

/** What listUserAccounts says during a connection's first minutes, and once it is done. */
const LOADING = { transactions: { initial_sync_completed: false, first_transaction_date: null } };
const LOADED = { transactions: { initial_sync_completed: true, first_transaction_date: '2025-11-03' } };

const fill = (id: string, type: 'BUY' | 'SELL', at: string) => ({
  id, type, units: 10, price: 500, fee: 0.5, trade_date: at, symbol: { symbol: 'SPY' }, account: { id: 'acct-1' },
});

type AccountRow = { historyLoaded: boolean; firstTransactionDate: string | null };

beforeEach(() => {
  store.clear();
  store.set('users/user-1/private/snaptrade', { userId: 'user-1', userSecret: 'stored-secret' });
  account.sync_status = LOADING;
  feed.length = 0;
  consumeDaily.mockClear();
  refundDaily.mockClear();
  recordJournalEvent.mockClear();
  getAccountActivities.mockClear();
});

describe('the status screen while SnapTrade is still loading a new connection', () => {
  it('says so for the account, so the screen can', async () => {
    const res = await handleBrokerConnectRequest(HEADERS, { action: 'status' });
    const [row] = res.body.accounts as AccountRow[];

    expect(res.statusCode).toBe(200);
    expect(row.historyLoaded).toBe(false);
    expect(row.firstTransactionDate).toBeNull();
  });

  it('reports a loaded history with the date it reaches back to', async () => {
    account.sync_status = LOADED;
    const res = await handleBrokerConnectRequest(HEADERS, { action: 'status' });
    const [row] = res.body.accounts as AccountRow[];

    expect(row.historyLoaded).toBe(true);
    expect(row.firstTransactionDate).toBe('2025-11-03');
  });

  it('reads a broker that reports nothing as loaded', async () => {
    account.sync_status = undefined;
    const res = await handleBrokerConnectRequest(HEADERS, { action: 'status' });
    const [row] = res.body.accounts as AccountRow[];

    expect(row.historyLoaded).toBe(true);
  });
});

describe('pressing Sync while SnapTrade is still loading the history', () => {
  it('answers with the wait, and pulls, spends and records nothing', async () => {
    const res = await handleBrokerConnectRequest(HEADERS, SYNC);

    expect(res.statusCode).toBe(200);
    expect(res.body.historyLoading).toBe(true);
    expect(res.body.message).toBe(
      'Charles Schwab is still sending us your history. This usually takes a few minutes after connecting. Try again shortly. This did not use a sync.',
    );
    expect(res.body.trades).toEqual([]);
    expect(consumeDaily).not.toHaveBeenCalled();
    expect(getAccountActivities).not.toHaveBeenCalled();
    expect(recordJournalEvent).not.toHaveBeenCalled();
    // No count on the answer: nothing was spent, so the meter has nothing to learn.
    expect(res.body.syncsRemaining).toBeUndefined();
  });

  it('syncs as before once the history has loaded', async () => {
    account.sync_status = LOADED;
    const res = await handleBrokerConnectRequest(HEADERS, SYNC);

    expect(res.statusCode).toBe(200);
    expect(res.body.historyLoading).toBeUndefined();
    expect(consumeDaily).toHaveBeenCalledTimes(1);
    expect(getAccountActivities).toHaveBeenCalledTimes(1);
    expect(recordJournalEvent).toHaveBeenCalledTimes(1);
  });

  it('syncs as before for a broker that does not report the field', async () => {
    account.sync_status = { transactions: {} };
    await handleBrokerConnectRequest(HEADERS, SYNC);

    expect(consumeDaily).toHaveBeenCalledTimes(1);
    expect(getAccountActivities).toHaveBeenCalledTimes(1);
  });
});

describe('what the history row says about the charge', () => {
  it('records an empty sync as refunded, and the row says it was not charged', async () => {
    account.sync_status = LOADED;
    const res = await handleBrokerConnectRequest(HEADERS, SYNC);

    expect(refundDaily).toHaveBeenCalledWith('sync', 'user-1', 'daily');
    expect(res.body.syncRefunded).toBe(true);

    const [, event] = recordJournalEvent.mock.calls[0];
    expect(event.sync?.refunded).toBe(true);
    // The count the row reports is the one the trader is left with: four after the spend, plus
    // the one handed back.
    expect(event.sync?.syncsRemaining).toBe(5);

    const line = describeEvent(event);
    expect(line).toContain('no activity at all');
    expect(line).toContain('This sync was not charged.');
    expect(line).not.toContain('spent for nothing');
  });

  it('records a sync that produced trades as charged', async () => {
    account.sync_status = LOADED;
    feed.push(fill('a1', 'BUY', '2026-10-14T14:31:00Z'), fill('a2', 'SELL', '2026-10-14T15:02:00Z'));
    const res = await handleBrokerConnectRequest(HEADERS, SYNC);

    expect((res.body.trades as unknown[]).length).toBe(1);
    expect(refundDaily).not.toHaveBeenCalled();

    const [, event] = recordJournalEvent.mock.calls[0];
    expect(event.sync?.refunded).toBe(false);
    expect(event.sync?.syncsRemaining).toBe(4);
    expect(describeEvent(event)).not.toContain('not charged');
  });
});

describe('the morning import while SnapTrade is still loading a connection', () => {
  it('skips the account: no pull, no sync state, and no history row for the caller to write', async () => {
    const out = await pullRecentActivityForUser('user-1', '2026-10-08', 3);

    expect(out.accounts).toBe(1);
    expect(out.pulls).toBe(0);
    expect(out.historyLoading).toBe(1);
    // Not "left for a manual sync" either — a manual sync would be declined the same way.
    expect(out.skippedAccounts).toBe(0);
    expect(out.perAccount).toEqual([]);
    expect(getAccountActivities).not.toHaveBeenCalled();
    expect(store.has('users/user-1/private/brokerSync')).toBe(false);
  });

  it('pulls it the morning the history has loaded', async () => {
    account.sync_status = LOADED;
    const out = await pullRecentActivityForUser('user-1', '2026-10-08', 3);

    expect(out.pulls).toBe(1);
    expect(out.historyLoading).toBe(0);
    expect(out.perAccount).toHaveLength(1);
    expect(store.has('users/user-1/private/brokerSync')).toBe(true);
  });
});
