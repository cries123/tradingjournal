import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedBrokerStatus, readCachedBrokerStatus, writeCachedBrokerStatus } from './brokerStatusCache';
import type { BrokerStatus } from './brokerConnect';

/*
 * The connect screen drew nothing for the four or five seconds SnapTrade took to answer, every
 * visit, and then the trader's own Schwab appeared. The last answer is shown at once instead.
 */

const schwab: BrokerStatus = {
  registered: true,
  accounts: [{ id: 'acct-1', name: 'Individual …653', institutionName: 'Charles Schwab', authorizationId: 'auth-1' }],
};

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    store,
  };
}

describe('the broker status cache', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => {
    clearCachedBrokerStatus('u1');
    clearCachedBrokerStatus('u2');
    vi.unstubAllGlobals();
  });

  it('gives back the last answer for the same user', () => {
    writeCachedBrokerStatus('u1', schwab, 1_000);
    expect(readCachedBrokerStatus('u1', 2_000)).toEqual(schwab);
  });

  it('never shows one person another person’s accounts', () => {
    writeCachedBrokerStatus('u1', schwab, 1_000);
    expect(readCachedBrokerStatus('u2', 2_000)).toBeNull();
  });

  it('survives a reload through localStorage', () => {
    writeCachedBrokerStatus('u1', schwab, 1_000);
    clearMemoryOnly();
    expect(readCachedBrokerStatus('u1', 2_000)).toEqual(schwab);
  });

  it('is not shown once it is a month old — that is a guess, not a memory', () => {
    writeCachedBrokerStatus('u1', schwab, 0);
    expect(readCachedBrokerStatus('u1', 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('ignores a value that is not a status, such as one from an older build', () => {
    storage.setItem('trend-chasers-broker-status:u1', JSON.stringify({ at: 1_000, value: { nope: true } }));
    expect(readCachedBrokerStatus('u1', 2_000)).toBeNull();
  });

  it('still works when storage throws, from the in-memory copy', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    writeCachedBrokerStatus('u1', schwab, 1_000);
    expect(readCachedBrokerStatus('u1', 2_000)).toEqual(schwab);
  });

  it('is cleared on sign-out', () => {
    writeCachedBrokerStatus('u1', schwab, 1_000);
    clearCachedBrokerStatus('u1');
    expect(readCachedBrokerStatus('u1', 2_000)).toBeNull();
    expect(storage.store.size).toBe(0);
  });

  /** Drops the memory copy without touching storage, to prove storage alone is enough. */
  function clearMemoryOnly() {
    const saved = storage.store.get('trend-chasers-broker-status:u1');
    clearCachedBrokerStatus('u1');
    if (saved) storage.store.set('trend-chasers-broker-status:u1', saved);
  }
});
