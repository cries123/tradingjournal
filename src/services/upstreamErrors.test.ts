import { describe, expect, it } from 'vitest';
import {
  describeHttpError,
  isClientRejected,
  isRejectedCredential,
  isUpstreamOutage,
  maskKeys,
  readableUpstreamError,
  redactUrl,
  upstreamSummary,
} from '../../server/upstreamErrors';
import { normalizeError } from './errorFingerprint';

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

/**
 * The SnapTrade SDK signs requests with credentials in the query string, so a thrown error's url
 * carries the caller's userSecret in plain text. The admin detail shows that url — it is the most
 * useful part of a failure, because it names the endpoint — and shipped a live secret to the panel,
 * from where it went into a screenshot. Every assertion here is about that not happening again.
 */
describe('redactUrl', () => {
  const real =
    'https://api.snaptrade.com/authorizations/49b412a9/disable' +
    '?clientId=TREND-CHASERS-TNNCU&userId=PwLvNDZf0nXkKVvj&userSecret=5ed5993f-85aa-412a&timestamp=1788200287';

  it('removes the userSecret', () => {
    const out = redactUrl(real)!;
    expect(out).not.toContain('5ed5993f');
    expect(out).toContain('userSecret=[redacted]');
  });

  it('removes the user id', () => {
    expect(redactUrl(real)!).not.toContain('PwLvNDZf0nXkKVvj');
  });

  it('keeps everything that makes the message useful', () => {
    const out = redactUrl(real)!;
    expect(out).toContain('/authorizations/49b412a9/disable');
    expect(out).toContain('timestamp=1788200287');
  });

  it('matches parameter names case-insensitively', () => {
    expect(redactUrl('https://x/y?USERSECRET=abc')!).toContain('USERSECRET=[redacted]');
    expect(redactUrl('https://x/y?consumerKey=abc')!).not.toContain('abc');
  });

  it('leaves a url with no query string alone', () => {
    expect(redactUrl('https://api.snaptrade.com/brokerages')).toBe('https://api.snaptrade.com/brokerages');
  });

  it('handles a missing url', () => {
    expect(redactUrl(undefined)).toBeUndefined();
  });

  it('redacts through describeHttpError, which is what the panel actually calls', () => {
    const err = Object.assign(new Error('Request failed with status code 403'), {
      status: 403,
      responseBody: { detail: 'Feature is not enabled for this customer or this connection' },
      method: 'POST',
      url: real,
    });
    const described = describeHttpError(err);
    expect(described.url).not.toContain('5ed5993f');
    expect(described.body).toContain('Feature is not enabled');
  });
});

/**
 * The admin panel reported three connected users after a move from test to production SnapTrade
 * keys, and it was not clear whether those were live connections or the remains of test ones.
 *
 * Both halves could be wrong: every stored userSecret is issued by one client, so changing keys
 * invalidates all of them at once — and the panel fell back to cached rows when the live check
 * failed, rows written while the old keys still worked. isRejectedCredential is what now separates
 * "we could not ask" from "we asked and this secret is dead", so the count stops inheriting the
 * previous environment.
 */
describe('a stale-environment secret is recognised, not treated as a failed check', () => {
  const sdkError = (status: number, responseBody: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      name: 'SnaptradeError',
      status,
      responseBody,
    });

  it('recognises a secret issued by different credentials', () => {
    // What listUserAccounts returns for every user after a key change.
    expect(isRejectedCredential(sdkError(401, { detail: 'Unable to verify signature' }))).toBe(true);
    expect(isRejectedCredential(sdkError(404, { detail: 'User not found' }))).toBe(true);
  });

  it('still lets a real outage fall back to the cached row', () => {
    // Here the cache is the best information available and keeping it is correct.
    expect(isRejectedCredential(sdkError(503, 'upstream unavailable'))).toBe(false);
    expect(isRejectedCredential(Object.assign(new Error('fetch failed'), { code: 'ETIMEDOUT' }))).toBe(false);
  });
});

/**
 * The October outage: SnapTrade answered every call with 401 "Invalid clientId provided", code 1083.
 * Nothing was wrong with any user. The recovery path read each 401 as one user's dead secret and
 * deleted it — so this is the predicate that has to say "the app", not "this user".
 */
describe('isClientRejected', () => {
  const sdkError = (status: number, responseBody: unknown, url = 'https://api.snaptrade.com/api/v1/accounts?clientId=TC&userSecret=s3cret', headers = '{}') =>
    Object.assign(new Error(`Request failed with status code ${status}\nRESPONSE HEADERS:\n${headers}`), {
      name: 'SnaptradeError',
      status,
      responseBody,
      method: 'GET',
      url,
    });

  const refusedClient = () =>
    sdkError(401, { detail: 'Invalid clientId provided - TREND-CHASERS-TNNCU', status_code: 401, code: '1083' });

  it('recognises a refused client id', () => {
    expect(isClientRejected(refusedClient())).toBe(true);
  });

  it('recognises a refused consumer key', () => {
    expect(isClientRejected(sdkError(403, { detail: 'Invalid consumer key' }))).toBe(true);
  });

  it('treats any refusal of registerUser as the app, whatever the body says', () => {
    // registerUser is signed with the app's keys and nothing else — there is no user to blame.
    const err = sdkError(401, { detail: 'Unauthorized' }, 'https://api.snaptrade.com/api/v1/snapTrade/registerUser?clientId=TC');
    expect(isClientRejected(err)).toBe(true);
  });

  it('is not triggered by the code alone', () => {
    // SnapTrade does not document 1083. If it is shared with a per-user refusal, keying on it would
    // turn every dead user secret into an app-wide alarm.
    const err = sdkError(401, { detail: 'Invalid userID or userSecret provided', code: '1083' });
    expect(isClientRejected(err)).toBe(false);
    expect(isRejectedCredential(err)).toBe(true);
  });

  it('ignores a header that happens to mention a client id', () => {
    // The SDK appends every response header to the message. Only the first line is the message.
    const err = sdkError(401, { detail: 'Unable to verify signature' }, undefined, '{"x-snaptrade-clientid":"TREND-CHASERS-TNNCU"}');
    expect(isClientRejected(err)).toBe(false);
  });

  it('is not a refused user secret, so recovery leaves it alone', () => {
    expect(isRejectedCredential(refusedClient())).toBe(false);
  });

  it('is never an outage, an entitlement refusal or a bad request', () => {
    expect(isClientRejected(sdkError(503, 'clientId service down'))).toBe(false);
    expect(isClientRejected(sdkError(403, { detail: 'Subscription unavailable' }))).toBe(false);
    expect(isClientRejected(sdkError(400, { detail: 'clientId is required' }))).toBe(false);
    expect(isClientRejected(null)).toBe(false);
  });
});

/**
 * What the admin panel's error list shows for an upstream failure. It showed the SDK's message:
 * the status line, then forty lines of response headers, with the reason cut off below them.
 */
describe('upstreamSummary', () => {
  const sdkError = (status: number, responseBody: unknown, date = 'Sat, 10 Oct 2026 14:02:11 GMT') =>
    Object.assign(
      new Error(`Request failed with status code ${status}\nRESPONSE HEADERS:\n{"date":"${date}","x-request-id":"7521a30cb4fd08ce751c77b5242c72ee"}`),
      {
        name: 'SnaptradeError',
        status,
        responseBody,
        method: 'post',
        url: 'https://api.snaptrade.com/api/v1/snapTrade/registerUser?clientId=TC&timestamp=1791640931&userSecret=s3cret',
      },
    );

  it('says who refused what, and SnapTrade’s reason with its code', () => {
    expect(upstreamSummary(sdkError(401, { detail: 'Invalid clientId provided - TREND-CHASERS-TNNCU', code: '1083' }))).toBe(
      'SnapTrade 401 · POST /api/v1/snapTrade/registerUser · Invalid clientId provided - TREND-CHASERS-TNNCU (code 1083)',
    );
  });

  it('never carries the query string, which holds the signed secret', () => {
    const line = upstreamSummary(sdkError(401, { detail: 'nope' }))!;
    expect(line).not.toContain('s3cret');
    expect(line).not.toContain('?');
  });

  it('never carries the headers', () => {
    expect(upstreamSummary(sdkError(401, { detail: 'nope' }))).not.toMatch(/RESPONSE HEADERS|x-request-id/);
  });

  it('shows a body that is not JSON as it came, on one line', () => {
    expect(upstreamSummary(sdkError(502, '<html>\n  Bad gateway\n</html>'))).toBe(
      'SnapTrade 502 · POST /api/v1/snapTrade/registerUser · <html> Bad gateway </html>',
    );
  });

  it('labels a non-SnapTrade failure as plain HTTP', () => {
    expect(upstreamSummary({ response: { status: 500, data: 'boom' } })).toBe('HTTP 500 · boom');
  });

  it('is null when nothing answered, so the original message is kept', () => {
    expect(upstreamSummary(Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }))).toBeNull();
    expect(upstreamSummary(null)).toBeNull();
  });
});

describe('readableUpstreamError', () => {
  const sdkError = (date: string) => {
    const err = Object.assign(
      new Error(`Request failed with status code 401\nRESPONSE HEADERS:\n{"date":"${date}"}`),
      {
        name: 'SnaptradeError',
        status: 401,
        responseBody: { detail: 'Invalid clientId provided - TREND-CHASERS-TNNCU', code: '1083' },
        method: 'POST',
        url: 'https://api.snaptrade.com/api/v1/snapTrade/registerUser',
      },
    );
    err.stack = `SnaptradeError: ${err.message}\n    at registerFresh (server/snaptradeCredentials.ts:70:5)\n    at handleConnect (server/brokerConnectHandler.ts:250:3)`;
    return err;
  };

  it('groups every occurrence of one fault into one admin row', () => {
    // The header dump carries the date of each response, so the raw messages differ every time.
    const a = normalizeError(readableUpstreamError(sdkError('Sat, 10 Oct 2026 14:02:11 GMT')), 'server', 'broker-connect');
    const b = normalizeError(readableUpstreamError(sdkError('Sun, 11 Oct 2026 09:41:57 GMT')), 'server', 'broker-connect');
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.message).toContain('Invalid clientId provided');
  });

  it('keeps the frames and drops the header dump from the stack', () => {
    const readable = readableUpstreamError(sdkError('Sat, 10 Oct 2026 14:02:11 GMT')) as Error;
    expect(readable.name).toBe('SnaptradeError');
    expect(readable.stack).toContain('at registerFresh');
    expect(readable.stack).not.toContain('RESPONSE HEADERS');
  });

  it('returns anything without a status untouched', () => {
    const err = new TypeError('x is undefined');
    expect(readableUpstreamError(err)).toBe(err);
  });
});

/*
 * SnapTrade echoes back the client id it was sent. With the consumer key pasted into
 * SNAPTRADE_CLIENT_ID by mistake, the panel printed the consumer key — a secret — on screen and into
 * the stored error row. It happened, on 10 October.
 */
describe('maskKeys', () => {
  const KEY = '8ot3Gyhwc4ynPKFHLr33GKWr1izz2393ZCNBIVlORSPpC91Dk1';

  it('hides a key-length string, keeping enough to tell which one it was', () => {
    const line = upstreamSummary(
      Object.assign(new Error('Request failed with status code 401'), {
        name: 'SnaptradeError',
        status: 401,
        responseBody: { detail: `Invalid clientId provided - ${KEY}`, code: '1083' },
        method: 'POST',
        url: 'https://api.snaptrade.com/api/v1/snapTrade/registerUser',
      }),
    )!;
    expect(line).not.toContain(KEY);
    expect(line).toContain('8ot3…[50 chars hidden]');
  });

  it('leaves a real client id, and ordinary words and codes, readable', () => {
    expect(maskKeys('Invalid clientId provided - TREND-CHASERS-TNNCU (code 1083)')).toBe(
      'Invalid clientId provided - TREND-CHASERS-TNNCU (code 1083)',
    );
  });
});
