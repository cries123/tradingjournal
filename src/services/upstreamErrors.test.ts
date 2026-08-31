import { describe, expect, it } from 'vitest';
import { isUpstreamOutage } from '../../server/upstreamErrors';

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
 * The recovery path this guards deletes a user's stored broker secret and re-registers them, so a
 * false positive costs someone a working connection. These pin the cases where that must not fire.
 */
describe('outage errors must never look like a rejected credential', () => {
  // Mirrors isRejectedCredential in brokerConnectHandler: outage first, then the auth signals.
  const rejectedCredential = (err: unknown): boolean => {
    if (isUpstreamOutage(err)) return false;
    const status = (err as { status?: number; response?: { status?: number } } | null)?.response
      ?.status ?? (err as { status?: number } | null)?.status;
    if (status === 401 || status === 403) return true;
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    return (
      message.includes('signature') ||
      message.includes('unauthorized') ||
      message.includes('unable to verify') ||
      (message.includes('user') && message.includes('not found'))
    );
  };

  it('still recognises a genuinely rejected secret', () => {
    expect(rejectedCredential({ status: 401 })).toBe(true);
    expect(rejectedCredential(new Error('Unable to verify signature'))).toBe(true);
    expect(rejectedCredential(new Error('User not found'))).toBe(true);
  });

  it('does not re-register when the provider is simply unreachable', () => {
    expect(rejectedCredential(new Error('fetch failed'))).toBe(false);
    expect(rejectedCredential(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe(false);
    expect(rejectedCredential({ status: 503 })).toBe(false);
  });

  it('does not re-register on a 401 that arrived with an outage-shaped cause', () => {
    // A degraded API can answer 401 for reasons that have nothing to do with the caller. Deleting
    // a working secret over that is exactly the failure this ordering prevents.
    expect(rejectedCredential(Object.assign(new Error('unauthorized'), { cause: { code: 'ECONNRESET' } }))).toBe(false);
  });
});

/**
 * A 403 is the dangerous case: SnapTrade returns it both for a rejected signature and for a
 * request the caller is not entitled to make. The recovery path deletes the user's stored secret,
 * so reading "not entitled" as "dead credential" costs someone a working connection over an
 * unrelated subscription gap.
 */
describe('a 403 only counts as a rejected credential when it says so', () => {
  const rejectedCredential = (err: unknown): boolean => {
    if (isUpstreamOutage(err)) return false;
    const res = (err as { response?: { status?: number; data?: unknown } } | null)?.response;
    const status = res?.status ?? (err as { status?: number } | null)?.status;
    if (status === 401) return true;
    const body = typeof res?.data === 'string' ? res.data : res?.data ? JSON.stringify(res.data) : '';
    const haystack = `${err instanceof Error ? err.message : ''} ${body}`.toLowerCase();
    const saysCredential =
      haystack.includes('signature') ||
      haystack.includes('unauthorized') ||
      haystack.includes('unable to verify') ||
      (haystack.includes('user') && haystack.includes('not found'));
    if (status === 403) return saysCredential;
    return saysCredential;
  };

  it('treats a 401 as a dead credential without needing the body', () => {
    expect(rejectedCredential({ response: { status: 401, data: {} } })).toBe(true);
  });

  it('treats a 403 about a signature as a dead credential', () => {
    expect(
      rejectedCredential({ response: { status: 403, data: { detail: 'Unable to verify signature' } } }),
    ).toBe(true);
  });

  it('does NOT delete a secret over a 403 about an entitlement', () => {
    // The Schwab/Akoya case: the keys are fine, the subscription is not. Re-registering here would
    // destroy a working Robinhood connection to fix nothing.
    expect(
      rejectedCredential({ response: { status: 403, data: { detail: 'Subscription unavailable' } } }),
    ).toBe(false);
  });

  it('reads the body, not just the axios message, which only carries headers', () => {
    const axiosish = Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403, data: { detail: 'Unable to verify signature.' } },
    });
    expect(rejectedCredential(axiosish)).toBe(true);
  });
});
