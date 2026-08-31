import { describe, expect, it } from 'vitest';
import { describeHttpError, isRejectedCredential, isUpstreamOutage } from '../../server/upstreamErrors';

/**
 * This predicate decides whether a user gets their sync back. Too strict and they pay for an
 * outage — which is the bug it was written for. Too loose and every rejected call is refunded,
 * which makes the daily cap a suggestion.
 */
describe('isUpstreamOutage', () => {
  it('refunds when the request never got an answer', () => {
    expect(isUpstreamOutage(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))).toBe(true);
    expect(isUpstreamOutage(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(isUpstreamOutage(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toBe(true);
    expect(isUpstreamOutage(Object.assign(new Error('x'), { code: 'UND_ERR_CONNECT_TIMEOUT' }))).toBe(true);
  });

  it('refunds on an upstream 5xx, in either error shape', () => {
    expect(isUpstreamOutage({ status: 503 })).toBe(true);
    expect(isUpstreamOutage({ response: { status: 500 } })).toBe(true);
    expect(isUpstreamOutage({ response: { status: 502 } })).toBe(true);
  });

  it('does NOT refund when SnapTrade answered and said no', () => {
    // The call happened and spent the quota it was capped for. Refunding a 4xx would let a client
    // that sends deliberately bad requests sync without limit.
    expect(isUpstreamOutage({ status: 400 })).toBe(false);
    expect(isUpstreamOutage({ status: 401 })).toBe(false);
    expect(isUpstreamOutage({ status: 403 })).toBe(false);
    expect(isUpstreamOutage({ response: { status: 429 } })).toBe(false);
  });

  it('prefers an explicit status over anything in the message', () => {
    // A 400 whose body happens to mention a timeout is still SnapTrade answering.
    expect(isUpstreamOutage(Object.assign(new Error('request timeout on their side'), { status: 400 }))).toBe(false);
  });

  it('falls back to the message only when there is no status or code', () => {
    expect(isUpstreamOutage(new Error('fetch failed'))).toBe(true);
    expect(isUpstreamOutage(new Error('socket hang up'))).toBe(true);
    expect(isUpstreamOutage(new Error('network error'))).toBe(true);
    expect(isUpstreamOutage(new Error('Account not found'))).toBe(false);
  });

  it('does not refund on nothing-shaped errors', () => {
    // Refunding an error we cannot classify would mean an unknown bug quietly hands out free syncs.
    expect(isUpstreamOutage(null)).toBe(false);
    expect(isUpstreamOutage(undefined)).toBe(false);
    expect(isUpstreamOutage('something went wrong')).toBe(false);
    expect(isUpstreamOutage({})).toBe(false);
  });
});



/**
 * The SnapTrade SDK throws its own error type, not an axios one. Reading err.response.data — the
 * obvious thing to write — finds nothing on every SnapTrade failure, which is how the admin panel
 * ended up reporting a bare "HTTP 403" with the explanation sitting one property away.
 */
describe('describeHttpError', () => {
  /** Shaped exactly like SnaptradeError: status at the top level, body on responseBody. */
  const snaptradeError = (status: number, responseBody: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}\nRESPONSE HEADERS:\n{}`), {
      name: 'SnaptradeError',
      status,
      responseBody,
      method: 'POST',
      url: '/api/v1/snapTrade/login',
    });

  it('finds the body the SDK actually carries', () => {
    const d = describeHttpError(snaptradeError(403, { detail: 'Subscription unavailable' }));
    expect(d.status).toBe(403);
    expect(d.body).toContain('Subscription unavailable');
    expect(d.method).toBe('POST');
  });

  it('still handles an ordinary axios error', () => {
    const d = describeHttpError({ response: { status: 500, data: 'boom' } });
    expect(d.status).toBe(500);
    expect(d.body).toBe('boom');
  });

  it('returns an empty body rather than "undefined" when there was none', () => {
    // This string is shown to the admin; the word "undefined" in it is worse than nothing.
    expect(describeHttpError({ status: 404 }).body).toBe('');
    expect(describeHttpError(null).body).toBe('');
  });

  it('does not lose a string body that happens to be falsy-ish', () => {
    expect(describeHttpError({ status: 400, responseBody: '0' }).body).toBe('0');
  });
});

/**
 * The real function, not a copy of it.
 *
 * These previously reimplemented isRejectedCredential because it lived in a module that pulls in
 * firebase-admin and the SnapTrade SDK. A test that mirrors the logic it is checking passes while
 * production breaks — so the function moved here instead.
 *
 * What it guards matters: a true answer makes the server delete the user's stored broker secret
 * and re-register them, which costs them every connection they had.
 */
describe('isRejectedCredential', () => {
  /** The shape the SDK genuinely throws — verified against the live API. */
  const sdkError = (status: number, responseBody: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}\nRESPONSE HEADERS:\n{}`), {
      name: 'SnaptradeError',
      status,
      responseBody,
      method: 'POST',
      url: '/api/v1/snapTrade/login',
    });

  it('treats a 401 as a dead credential on its own', () => {
    expect(isRejectedCredential(sdkError(401, { detail: 'anything' }))).toBe(true);
  });

  it('treats a 403 that names a signature problem as a dead credential', () => {
    expect(isRejectedCredential(sdkError(403, { detail: 'Unable to verify signature' }))).toBe(true);
  });

  it('does NOT re-register over a 403 about an entitlement', () => {
    // The Schwab case. The keys are fine and the subscription is not; deleting the secret here
    // would destroy a working Robinhood connection to fix nothing.
    expect(isRejectedCredential(sdkError(403, { detail: 'Subscription unavailable' }))).toBe(false);
  });

  it('reads the body, which is the only place the reason appears', () => {
    // err.response is undefined on every SnapTrade error — confirmed against the live API — so a
    // check reading err.response.data matches an empty string and silently never fires.
    const err = sdkError(403, { detail: 'Unable to verify signature.' });
    expect((err as { response?: unknown }).response).toBeUndefined();
    expect(isRejectedCredential(err)).toBe(true);
  });

  it('never fires when the provider is simply unreachable', () => {
    expect(isRejectedCredential(Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }))).toBe(false);
    expect(isRejectedCredential(sdkError(503, 'gateway down'))).toBe(false);
  });

  it('does not fire on an unclassifiable error', () => {
    expect(isRejectedCredential(null)).toBe(false);
    expect(isRejectedCredential(sdkError(400, {}))).toBe(false);
  });
});
