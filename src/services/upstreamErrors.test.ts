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
