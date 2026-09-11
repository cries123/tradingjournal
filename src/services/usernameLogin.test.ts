import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_WINDOW_MS,
  MAX_ATTEMPTS,
  nextAttemptState,
  REFUSAL,
} from '../../server/usernameLogin';

const NOW = Date.parse('2026-09-10T12:00:00.000Z');

/*
 * The counter that replaces Firebase's own.
 *
 * Firebase rate-limits password sign-in by calling IP, and every call this endpoint makes carries
 * Netlify's IP rather than the visitor's — so an attacker guessing passwords through it would get
 * the whole function throttled instead of themselves, and every real user with it. This is the
 * only thing standing between a public endpoint and unlimited password guesses.
 */

describe('nextAttemptState', () => {
  it('starts a window for the first attempt', () => {
    expect(nextAttemptState(null, NOW)).toEqual({
      blocked: false,
      count: 1,
      windowStartedAt: new Date(NOW).toISOString(),
    });
  });

  it('counts up inside the window without moving its start', () => {
    const started = new Date(NOW - 60_000).toISOString();
    const state = nextAttemptState({ count: 3, windowStartedAt: started }, NOW);
    expect(state).toEqual({ blocked: false, count: 4, windowStartedAt: started });
  });

  it('blocks once past the cap', () => {
    const started = new Date(NOW - 60_000).toISOString();
    const state = nextAttemptState({ count: MAX_ATTEMPTS, windowStartedAt: started }, NOW);
    expect(state.count).toBe(MAX_ATTEMPTS + 1);
    expect(state.blocked).toBe(true);
  });

  it('lets the cap itself through', () => {
    // The tenth attempt of ten is still allowed; blocking begins at the eleventh. Off by one here
    // is the difference between "10 tries" and "9 tries" for every person who mistypes.
    const started = new Date(NOW - 60_000).toISOString();
    expect(nextAttemptState({ count: MAX_ATTEMPTS - 1, windowStartedAt: started }, NOW).blocked).toBe(
      false,
    );
  });

  it('starts fresh once the window has expired', () => {
    const started = new Date(NOW - ATTEMPT_WINDOW_MS - 1).toISOString();
    const state = nextAttemptState({ count: 500, windowStartedAt: started }, NOW);
    expect(state).toEqual({
      blocked: false,
      count: 1,
      windowStartedAt: new Date(NOW).toISOString(),
    });
  });

  it('starts fresh on an unreadable window rather than trusting the count', () => {
    // A corrupt record must not be a way to arrive pre-blocked, and must not be a way to arrive
    // with an unexpired window either. Either reading is wrong; a new window is the safe one.
    const state = nextAttemptState({ count: 99, windowStartedAt: 'nonsense' }, NOW);
    expect(state).toMatchObject({ blocked: false, count: 1 });
  });

  it('treats a missing count as zero', () => {
    const started = new Date(NOW - 60_000).toISOString();
    expect(nextAttemptState({ windowStartedAt: started }, NOW).count).toBe(1);
  });
});

describe('the refusal message', () => {
  it('names neither the username nor the password as the problem', () => {
    // Every failure returns this one string: wrong handle, wrong password, no password on the
    // account, throttled. Anything more specific tells a stranger which handles exist.
    expect(REFUSAL).toBe('Wrong username or password.');
  });
});
