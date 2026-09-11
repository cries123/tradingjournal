import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPendingAppView, takePendingAppView } from './pendingAppView';

/*
 * The hand-off between a marketing page and the journal.
 *
 * Two things matter here and neither is obvious. The value comes back out of sessionStorage, which
 * the user can edit, and is then pushed straight onto the view stack — so anything not on the
 * allowed list has to become "no pending view" rather than a screen name nothing renders. And the
 * read CLEARS: a pending view that survives its mount is one that ambushes the next one.
 */

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe('pendingAppView', () => {
  it('hands over each account screen', () => {
    for (const view of ['account', 'subscription', 'order-history', 'connect-broker'] as const) {
      setPendingAppView(view);
      expect(takePendingAppView()).toBe(view);
    }
  });

  it('clears what it reads', () => {
    setPendingAppView('subscription');
    expect(takePendingAppView()).toBe('subscription');
    expect(takePendingAppView()).toBeNull();
  });

  it('refuses a view nobody offers', () => {
    // Straight from sessionStorage onto the view stack, so an edited value must not name a screen.
    store.set('tc-pending-app-view', 'admin');
    expect(takePendingAppView()).toBeNull();
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    });

    expect(() => setPendingAppView('account')).not.toThrow();
    expect(takePendingAppView()).toBeNull();
  });
});
