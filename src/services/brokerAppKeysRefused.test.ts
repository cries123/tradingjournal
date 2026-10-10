import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * What a user and the admin see while SnapTrade is refusing the app's own client id.
 *
 * The October outage, end to end through the real handler: every broker screen answered "Broker
 * connect request failed. Please try again." — wrong on both counts, since nothing about the user's
 * connection had failed and trying again could not work — while the recovery underneath deleted the
 * stored SnapTrade secret of each user who opened one. Only SnapTrade, Firestore and the caller's
 * identity are faked; the handler, the recovery and the classification are the production code.
 */

const { store, deletes, caller, refusal, registerSnapTradeUser, logServerError } = vi.hoisted(() => {
  const refusal = () =>
    Object.assign(
      new Error('Request failed with status code 401\nRESPONSE HEADERS:\n{"date":"Sat, 10 Oct 2026 14:02:11 GMT"}'),
      {
        name: 'SnaptradeError',
        status: 401,
        responseBody: { detail: 'Invalid clientId provided - TREND-CHASERS-TNNCU', status_code: 401, code: '1083' },
        method: 'GET',
        url: 'https://api.snaptrade.com/api/v1/accounts?clientId=TREND-CHASERS-TNNCU&userSecret=stored-secret',
      },
    );
  return {
    store: new Map<string, Record<string, unknown>>(),
    deletes: [] as string[],
    caller: { uid: 'user-1' },
    refusal,
    registerSnapTradeUser: vi.fn(async () => {
      throw refusal();
    }),
    logServerError: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  };
});

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>('../../server/snaptradeAuth');
  return { ...actual, assertCallerUid: async () => caller.uid };
});

vi.mock('../../server/snaptradeClient', () => ({
  SNAPTRADE_CONFIGURED: true,
  resolveBrokerSlug: async (broker: string) => broker,
  getSnaptrade: () => ({
    accountInformation: {
      listUserAccounts: async () => {
        throw refusal();
      },
    },
    authentication: { registerSnapTradeUser },
  }),
}));

vi.mock('../../server/entitlements', () => ({
  resolveAccess: async () => ({ tier: 'gold', limits: { brokers: Number.MAX_SAFE_INTEGER, syncsPerDay: 10 } }),
  readEntitlement: async () => null,
  trialUntil: () => null,
}));

vi.mock('../../server/errorReports', () => ({ logServerError }));

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
      set: async (value: Record<string, unknown>) => {
        store.set(path, value);
      },
      delete: async () => {
        deletes.push(path);
        store.delete(path);
      },
    }),
  }),
}));

import { handleBrokerConnectRequest } from '../../server/brokerConnectHandler';

const SECRET_DOC = 'users/user-1/private/snaptrade';
const HEADERS = { authorization: 'Bearer t' };

beforeEach(() => {
  store.clear();
  deletes.length = 0;
  caller.uid = 'user-1';
  registerSnapTradeUser.mockClear();
  logServerError.mockClear();
  store.set(SECRET_DOC, { userId: 'user-1', userSecret: 'stored-secret' });
  store.set('config/admin', { uid: 'admin-1' });
});

describe('a broker screen while SnapTrade refuses the app', () => {
  it('keeps the user’s stored secret', async () => {
    await handleBrokerConnectRequest(HEADERS, { action: 'status' });

    expect(store.get(SECRET_DOC)).toEqual({ userId: 'user-1', userSecret: 'stored-secret' });
    expect(deletes).toEqual([]);
    expect(registerSnapTradeUser).not.toHaveBeenCalled();
  });

  it('tells the user it is on our side and that nothing was disconnected', async () => {
    const res = await handleBrokerConnectRequest(HEADERS, { action: 'status' });

    expect(res.statusCode).toBe(503);
    expect(String(res.body.error)).toMatch(/on our side/);
    expect(String(res.body.error)).toMatch(/Nothing has been disconnected/);
    // The reason is for the admin only.
    expect(res.body.detail).toBeUndefined();
  });

  it('reports it once, so it reaches the admin panel', async () => {
    await handleBrokerConnectRequest(HEADERS, { action: 'status' });

    expect(logServerError).toHaveBeenCalledTimes(1);
    expect(logServerError).toHaveBeenCalledWith('broker-connect', expect.objectContaining({ status: 401 }), { uid: 'user-1' });
  });

  it('gives the site admin SnapTrade’s reason, without the signed query string', async () => {
    caller.uid = 'admin-1';
    store.set('users/admin-1/private/snaptrade', { userId: 'admin-1', userSecret: 'admin-secret' });

    const res = await handleBrokerConnectRequest(HEADERS, { action: 'status' });

    expect(res.body.detail).toBe(
      'SnapTrade 401 · GET /api/v1/accounts · Invalid clientId provided - TREND-CHASERS-TNNCU (code 1083)',
    );
  });

  it('does not delete a secret on connect either, where registration is refused too', async () => {
    // A user with no stored secret goes straight to registration, which the same refused keys sign.
    store.delete(SECRET_DOC);
    const res = await handleBrokerConnectRequest(HEADERS, { action: 'connect', broker: 'ROBINHOOD' });

    expect(registerSnapTradeUser).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(503);
    expect(store.has(SECRET_DOC)).toBe(false);
  });
});
