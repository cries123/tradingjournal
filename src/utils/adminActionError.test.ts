import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminActionFailureMessage, describeAdminActionError, withTimeout } from './adminActionError';

/** What Firebase actually throws: an Error carrying a `code`. */
function firebaseError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('describeAdminActionError', () => {
  it('names the rules deploy for a denied write, because that is the actual cause', () => {
    const said = describeAdminActionError(
      firebaseError('permission-denied', 'Missing or insufficient permissions.'),
    );
    expect(said).toContain('republish firestore.rules');
  });

  it('does not blame the rules for a network failure', () => {
    const said = describeAdminActionError(firebaseError('unavailable', 'Backend unavailable'));
    expect(said).not.toContain('rules');
    expect(said).toContain('unreachable');
  });

  it('falls back to the message when the failure carries no code', () => {
    expect(describeAdminActionError(new Error('Setup is not a valid tier'))).toBe(
      'Setup is not a valid tier',
    );
  });

  it('never returns an empty string, so the banner always says something', () => {
    expect(describeAdminActionError(new Error(''))).toBe('Unknown error.');
    expect(describeAdminActionError(undefined)).toBe('Unknown error.');
    expect(describeAdminActionError('a thrown string')).toBe('Unknown error.');
  });

  it('reads the code off any object, since the Firebase error class is not importable here', () => {
    expect(describeAdminActionError({ code: 'permission-denied' })).toContain('republish');
  });
});

describe('adminActionFailureMessage', () => {
  it('leads with the action, so the feed says which button failed', () => {
    const said = adminActionFailureMessage(
      'Updating the ticket',
      firebaseError('permission-denied', 'Missing or insufficient permissions.'),
    );
    expect(said.startsWith('Updating the ticket failed:')).toBe(true);
  });
});

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes a value through untouched when the call answers in time', async () => {
    const promise = withTimeout(Promise.resolve(42), 'cost report', 1000);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe(42);
  });

  it('gives up on a call that never answers, and names it', async () => {
    const never = new Promise<number>(() => {});
    const promise = withTimeout(never, 'cost report', 1000);
    const assertion = expect(promise).rejects.toThrow('The cost report took longer than 1s.');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("keeps the call's own failure rather than replacing it with a timeout", async () => {
    const promise = withTimeout(Promise.reject(new Error('403 from the function')), 'health check', 1000);
    const assertion = expect(promise).rejects.toThrow('403 from the function');
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  /*
   * Asserting on the settled value here proves nothing: rejecting an already-resolved promise is a
   * silent no-op, so a missing clearTimeout would still look correct. What actually leaks is the
   * timer, so that is what gets asserted.
   */
  it('leaves no timer pending after the call answers', async () => {
    await withTimeout(Promise.resolve('ok'), 'server stats', 1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer pending after the call fails', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 'server stats', 1000)).rejects.toThrow(
      'nope',
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
