import { describe, expect, it, vi } from 'vitest';
import {
  getOrRegisterCreds,
  isAlreadyRegistered,
  RESET_NEEDED_MESSAGE,
  withCredentialRecovery,
  type CredentialDeps,
  type SnaptradeCreds,
} from '../../server/snaptradeCredentials';
import { BrokerRequestError } from '../../server/snaptradeAuth';

/*
 * The rule under test: a stored SnapTrade secret is only ever replaced by one SnapTrade has just
 * issued, and never deleted to make room.
 *
 * Recovery used to delete first. When SnapTrade refused the app's client id, every call from every
 * user looked like a dead secret, and each one deleted a working secret that SnapTrade's reset could
 * then not replace — reset requires the current secret. Every assertion below is about the store
 * after a failure, because the store is the part that cannot be undone.
 */

/** Shaped like the SDK's SnaptradeError: status and body as fields, headers dumped into the message. */
const sdkError = (status: number, responseBody: unknown, url = 'https://api.snaptrade.com/api/v1/accounts?clientId=TC&userSecret=s3cret') =>
  Object.assign(
    new Error(`Request failed with status code ${status}\nRESPONSE HEADERS:\n{"date":"Sat, 10 Oct 2026 14:02:11 GMT"}`),
    { name: 'SnaptradeError', status, responseBody, method: 'GET', url },
  );

const APP_KEYS_REFUSED = () =>
  sdkError(401, { detail: 'Invalid clientId provided - TREND-CHASERS-TNNCU', status_code: 401, code: '1083' });
const DEAD_SECRET = () => sdkError(401, { detail: 'Unable to verify signature sent' });
const ALREADY_EXISTS = () =>
  sdkError(400, { detail: 'User with the following userId already exist: u1', code: '1010' }, 'https://api.snaptrade.com/api/v1/snapTrade/registerUser');

const STORED: SnaptradeCreds = { userId: 'u1', userSecret: 'old-secret' };

function harness(opts: { stored?: SnaptradeCreds | null; register?: () => Promise<string> } = {}) {
  const store = new Map<string, SnaptradeCreds>();
  if (opts.stored !== null) store.set('u1', opts.stored ?? STORED);

  const register = vi.fn<(uid: string) => Promise<string>>(opts.register ?? (async () => 'new-secret'));
  const write = vi.fn(async (uid: string, creds: SnaptradeCreds) => {
    store.set(uid, creds);
  });
  const reportResetNeeded = vi.fn(async () => undefined);

  const deps: CredentialDeps = {
    read: async (uid) => store.get(uid) ?? null,
    write,
    register: (uid) => register(uid),
    reportResetNeeded,
  };
  return { store, deps, register, write, reportResetNeeded };
}

describe('when SnapTrade refuses the app itself', () => {
  it('leaves the stored secret exactly as it was', async () => {
    const h = harness();
    const call = vi.fn(async () => {
      throw APP_KEYS_REFUSED();
    });

    await expect(withCredentialRecovery('u1', STORED, call, h.deps)).rejects.toMatchObject({ status: 401 });

    expect(h.store.get('u1')).toEqual(STORED);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('does not try to register the user over it', async () => {
    // Registration is signed with the same refused keys; it cannot succeed and is one more call
    // per user per screen while the outage lasts.
    const h = harness();
    await expect(
      withCredentialRecovery('u1', STORED, async () => {
        throw APP_KEYS_REFUSED();
      }, h.deps),
    ).rejects.toThrow();

    expect(h.register).not.toHaveBeenCalled();
  });

  it('rethrows the original error, so the handler can report it and answer honestly', async () => {
    const h = harness();
    const original = APP_KEYS_REFUSED();
    await expect(
      withCredentialRecovery('u1', STORED, async () => {
        throw original;
      }, h.deps),
    ).rejects.toBe(original);
  });
});

describe('when one user’s secret is rejected', () => {
  it('stores the new secret only after SnapTrade has issued it, and retries with it', async () => {
    const h = harness();
    const call = vi
      .fn<(c: SnaptradeCreds) => Promise<string>>()
      .mockRejectedValueOnce(DEAD_SECRET())
      .mockResolvedValueOnce('accounts');

    await expect(withCredentialRecovery('u1', STORED, call, h.deps)).resolves.toBe('accounts');

    expect(h.store.get('u1')).toEqual({ userId: 'u1', userSecret: 'new-secret' });
    expect(call).toHaveBeenLastCalledWith({ userId: 'u1', userSecret: 'new-secret' });
  });

  it('keeps the stored secret when SnapTrade already has the user and will not issue one', async () => {
    const h = harness({
      register: async () => {
        throw ALREADY_EXISTS();
      },
    });

    const failure = withCredentialRecovery('u1', STORED, async () => {
      throw DEAD_SECRET();
    }, h.deps);

    await expect(failure).rejects.toBeInstanceOf(BrokerRequestError);
    await expect(failure).rejects.toMatchObject({ statusCode: 409, message: RESET_NEEDED_MESSAGE });
    expect(h.store.get('u1')).toEqual(STORED);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('puts that account in the admin panel, because only a reset there can fix it', async () => {
    const h = harness({
      register: async () => {
        throw ALREADY_EXISTS();
      },
    });

    await expect(
      withCredentialRecovery('u1', STORED, async () => {
        throw DEAD_SECRET();
      }, h.deps),
    ).rejects.toThrow();

    expect(h.reportResetNeeded).toHaveBeenCalledTimes(1);
    expect(h.reportResetNeeded).toHaveBeenCalledWith('u1', expect.any(Error));
  });

  it('touches nothing when the re-registration is itself refused', async () => {
    // A refused registration means the app's keys are the problem after all.
    const original = sdkError(401, { detail: 'Unauthorized' }, 'https://api.snaptrade.com/api/v1/snapTrade/registerUser');
    const h = harness({
      register: async () => {
        throw original;
      },
    });

    await expect(
      withCredentialRecovery('u1', STORED, async () => {
        throw DEAD_SECRET();
      }, h.deps),
    ).rejects.toBe(original);

    expect(h.store.get('u1')).toEqual(STORED);
    expect(h.reportResetNeeded).not.toHaveBeenCalled();
  });

  it('asks the user to reconnect when the fresh secret works but the brokerage link is gone', async () => {
    const h = harness();
    const failure = withCredentialRecovery('u1', STORED, async () => {
      throw DEAD_SECRET();
    }, h.deps);

    await expect(failure).rejects.toMatchObject({ statusCode: 409 });
    await expect(failure).rejects.toThrow(/reconnect/i);
    // The new secret is valid and is kept — throwing it away would only repeat the registration.
    expect(h.store.get('u1')?.userSecret).toBe('new-secret');
  });
});

describe('failures that are not about credentials', () => {
  it('are passed through without registering anything', async () => {
    const h = harness();
    for (const err of [
      sdkError(503, 'gateway down'),
      sdkError(403, { detail: 'Subscription unavailable' }),
      Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }),
    ]) {
      await expect(
        withCredentialRecovery('u1', STORED, async () => {
          throw err;
        }, h.deps),
      ).rejects.toBe(err);
    }
    expect(h.register).not.toHaveBeenCalled();
    expect(h.store.get('u1')).toEqual(STORED);
  });
});

describe('getOrRegisterCreds', () => {
  it('returns the stored secret without calling SnapTrade', async () => {
    const h = harness();
    await expect(getOrRegisterCreds('u1', h.deps)).resolves.toEqual(STORED);
    expect(h.register).not.toHaveBeenCalled();
  });

  it('registers and stores a user it has never seen', async () => {
    const h = harness({ stored: null });
    await expect(getOrRegisterCreds('u1', h.deps)).resolves.toEqual({ userId: 'u1', userSecret: 'new-secret' });
    expect(h.store.get('u1')?.userSecret).toBe('new-secret');
  });

  it('asks for a reset instead of resetting with a secret it does not have', async () => {
    // The old path called resetSnapTradeUserSecret with userSecret: '' here. SnapTrade's reset
    // needs the current secret, so that call could only ever fail — as an unexplained 500.
    const h = harness({
      stored: null,
      register: async () => {
        throw ALREADY_EXISTS();
      },
    });

    await expect(getOrRegisterCreds('u1', h.deps)).rejects.toMatchObject({ statusCode: 409, message: RESET_NEEDED_MESSAGE });
    expect(h.store.has('u1')).toBe(false);
    expect(h.reportResetNeeded).toHaveBeenCalledWith('u1', expect.any(Error));
  });
});

describe('isAlreadyRegistered', () => {
  it('reads the body, which is the only place SnapTrade says it', () => {
    const err = ALREADY_EXISTS();
    // The message is the status line and response headers — nothing in it says "already".
    expect(err.message.toLowerCase()).not.toContain('already');
    expect(isAlreadyRegistered(err)).toBe(true);
  });

  it('is not fooled by other 400s or by a refusal', () => {
    expect(isAlreadyRegistered(sdkError(400, { detail: 'Invalid broker slug' }))).toBe(false);
    expect(isAlreadyRegistered(APP_KEYS_REFUSED())).toBe(false);
  });
});
