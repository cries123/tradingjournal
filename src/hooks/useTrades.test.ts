import { describe, expect, it } from 'vitest';
import type { SyncStatus } from './useTrades';

/**
 * The dashboard decides between a skeleton and real content from syncStatus alone, so which
 * statuses count as "still working" is the whole of this behaviour.
 *
 * A signed-in user with a full journal was shown the empty "Start your journal" screen for a
 * moment on every sign-in: while Firebase auth resolved, user was null, which is
 * indistinguishable from signed-out if you only look at the value — and the code settled on
 * 'local' rather than waiting.
 */
const isLoading = (status: SyncStatus): boolean => status === 'loading';

describe('which sync statuses keep the skeleton up', () => {
  it('waits while loading', () => {
    expect(isLoading('loading')).toBe(true);
  });

  it('does not wait once a source has actually answered', () => {
    expect(isLoading('local')).toBe(false);
    expect(isLoading('cloud')).toBe(false);
  });

  it("does not wait on 'syncing', which is what a save looks like over a live journal", () => {
    // This is why setup must not use 'syncing' before the first snapshot: it would render an empty
    // dashboard rather than hold the skeleton.
    expect(isLoading('syncing')).toBe(false);
  });
});

/**
 * The rule the effect in useTrades now follows. "Not signed in" is a conclusion, not the absence
 * of a value, and only Firebase can reach it.
 */
function resolveStatus(authLoading: boolean, firebaseEnabled: boolean, user: unknown): SyncStatus {
  if (authLoading) return 'loading';
  if (!firebaseEnabled || !user) return 'local';
  return 'loading';
}

describe('sign-in never settles before auth has decided', () => {
  it('stays loading while auth is still resolving, even with no user yet', () => {
    expect(resolveStatus(true, true, null)).toBe('loading');
  });

  it('settles to local only once auth has confirmed there is no user', () => {
    expect(resolveStatus(false, true, null)).toBe('local');
  });

  it('keeps waiting for the first snapshot once a user is known', () => {
    expect(resolveStatus(false, true, { uid: 'u1' })).toBe('loading');
  });

  it('settles immediately when Firebase is not configured at all', () => {
    // A local-only build has nothing to wait for, and holding a skeleton forever would be worse.
    expect(resolveStatus(false, false, null)).toBe('local');
  });
});
