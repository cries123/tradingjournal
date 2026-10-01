import { describe, expect, it } from 'vitest';
import {
  BrokerApiError,
  BrokerReplyError,
  isReportableBrokerFailure,
} from './brokerConnect';

/*
 * What happens when the server's reply is not JSON.
 *
 * This is the bug that cost a customer. Two rows appeared on their account, 41 and 43 minutes
 * apart, both from an iPhone mid-sync, reading "SyntaxError: The string did not match the expected
 * pattern" with json@[native code] on top — WebKit's wording for a failed JSON parse. brokerApiPost
 * called res.json() before looking at res.ok and without the `.catch` every other service here
 * uses, so a short or empty body became a bare SyntaxError carrying no status, no body and no
 * usable frame. They cancelled saying syncing did not work and wasted their daily sync. It did not,
 * and it did.
 *
 * A sync is the longest-running request the app makes, which is why it is the one that loses its
 * body when a phone locks or the radio switches. The reply error exists so that arrives as a fact
 * instead of a mystery.
 */

describe('BrokerReplyError', () => {
  it('says the body was empty, which is what a dropped read looks like', () => {
    const err = new BrokerReplyError(200, '');

    expect(err.message).toContain('empty body');
    expect(err.message).toContain('HTTP 200');
    expect(err.bodyLength).toBe(0);
  });

  it('says how much arrived and keeps the start of it', () => {
    const err = new BrokerReplyError(502, '<html><body>Bad gateway</body></html>');

    expect(err.message).toContain('not JSON');
    expect(err.message).toContain('37 bytes');
    expect(err.bodySnippet).toContain('Bad gateway');
  });

  it('bounds the snippet, because this goes into a report and not a log file', () => {
    const err = new BrokerReplyError(200, 'x'.repeat(5000));

    expect(err.bodySnippet).toHaveLength(200);
    expect(err.bodyLength).toBe(5000);
  });

  it('keeps the original parse error as its cause', () => {
    // The repo's preserve-caught-error rule, and the only way to see WebKit's own wording again.
    const original = new SyntaxError('The string did not match the expected pattern');
    const err = new BrokerReplyError(200, 'nope', { cause: original });

    expect(err.cause).toBe(original);
  });
});

describe('isReportableBrokerFailure', () => {
  it('always reports a non-JSON reply, whatever the status', () => {
    /*
     * The trap this test exists to hold shut.
     *
     * The obvious fix was to fold this into BrokerApiError, which would have been worse than the
     * bug: those are only reported on a 5xx, and this arrives on a 200 — so the next occurrence
     * would have vanished from the feed entirely, with no row, no uid and nothing to chase.
     */
    expect(isReportableBrokerFailure(new BrokerReplyError(200, ''))).toBe(true);
    expect(isReportableBrokerFailure(new BrokerReplyError(404, 'nope'))).toBe(true);
    expect(isReportableBrokerFailure(new BrokerReplyError(502, '<html>'))).toBe(true);
  });

  it('still stays quiet about the failures that are not ours', () => {
    // A broker being down, or somebody out of syncs, is one row per user per attempt — enough to
    // bury the failures that are actually bugs.
    expect(isReportableBrokerFailure(new BrokerApiError('Out of syncs', 0, 5, undefined, 0, 429))).toBe(
      false,
    );
    expect(isReportableBrokerFailure(new BrokerApiError('SnapTrade down', 0, 5, undefined, 0, 503))).toBe(
      false,
    );
    expect(isReportableBrokerFailure(new Error('Load failed'))).toBe(false);
    expect(isReportableBrokerFailure(new Error('NetworkError when attempting to fetch'))).toBe(false);
  });

  it('still reports a server fault', () => {
    expect(isReportableBrokerFailure(new BrokerApiError('boom', 0, 5, undefined, 0, 500))).toBe(true);
  });
});
