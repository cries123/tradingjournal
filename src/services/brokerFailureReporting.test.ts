import { describe, expect, it } from 'vitest';
import { BrokerApiError, isReportableBrokerFailure } from './brokerConnect';

/*
 * Which failed broker calls earn a row in the error feed.
 *
 * None of them did. The connect screen's handler was named `reportError` and reported nothing —
 * it set two pieces of React state — so every failed sync was visible only to the person it
 * happened to. The first one anybody noticed was found by chance: an account with two spent syncs
 * and no trades imported.
 *
 * The opposite mistake is worse. SnapTrade being down is one row per user per attempt, and
 * somebody out of syncs for the day is not a fault at all. Either would bury the failures that
 * are actually ours to fix, which is the whole reason the feed was cleaned up in the first place.
 */

const apiError = (status: number) =>
  new BrokerApiError('nope', undefined, undefined, undefined, undefined, status);

describe('isReportableBrokerFailure', () => {
  it('reports a server fault', () => {
    expect(isReportableBrokerFailure(apiError(500))).toBe(true);
    expect(isReportableBrokerFailure(apiError(502))).toBe(true);
  });

  it('stays quiet when the upstream is down or unconfigured', () => {
    // 503 is SnapTrade unavailable. Loud, expected, and not ours — and it arrives from every user
    // who tries, which is exactly the shape that drowns a feed.
    expect(isReportableBrokerFailure(apiError(503))).toBe(false);
  });

  it('stays quiet for every refusal that is about the caller, not the code', () => {
    for (const status of [401, 402, 403, 404, 409, 429]) {
      expect(isReportableBrokerFailure(apiError(status)), String(status)).toBe(false);
    }
  });

  it('reports an unexpected throw, which is what a bug in this client looks like', () => {
    expect(isReportableBrokerFailure(new TypeError('x.map is not a function'))).toBe(true);
  });

  it('stays quiet when the connection simply dropped', () => {
    // A trader going into a tunnel mid-sync is not a defect, and on a phone-heavy user base it
    // would be the most common row in the feed.
    for (const message of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'Network request failed',
    ]) {
      expect(isReportableBrokerFailure(new TypeError(message)), message).toBe(false);
    }
  });

  it('treats a BrokerApiError with no status as a refusal rather than a fault', () => {
    // Older call sites construct it without one. Silence is the safe default: a missed report
    // costs visibility, a wrong one costs the signal in every other row.
    expect(isReportableBrokerFailure(new BrokerApiError('nope'))).toBe(false);
  });
});
