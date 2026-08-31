/**
 * Whether a failed pull means the user paid for an outage rather than for a call.
 *
 * The charge is taken before the pull on purpose — counting afterwards lets a retry loop pull for
 * free. The cost of that ordering is that when SnapTrade is unreachable, the user is billed a sync
 * for a request that never reached anyone, and the app has no way to notice it should not have
 * been. During the outage this was written for, three of a Diamond user's three daily syncs went
 * that way in a row, each one reported as a plain error while the meter still read "3 left".
 *
 * Refunds are limited to failures that clearly are not about this user's data: no response at all,
 * a timeout, or an upstream 5xx. A 4xx is SnapTrade answering — the call happened, the quota it was
 * capped for was spent, and refunding those is what turns the cap into a suggestion.
 */
export function isUpstreamOutage(err: unknown): boolean {
  const status = (err as { status?: number; response?: { status?: number } } | null)?.status
    ?? (err as { response?: { status?: number } } | null)?.response?.status;
  if (typeof status === 'number') return status >= 500;

  // No status at all: the request never got an answer. Fetch and undici surface this as a
  // TypeError or an AggregateError with a cause code rather than anything HTTP-shaped.
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.cause?.code
    ?? (err as { code?: string } | null)?.code;
  if (typeof code === 'string') {
    return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code);
  }

  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('socket hang up')
  );
}

/**
 * Normalises the two error shapes this server sees into a status and a body.
 *
 * The SnapTrade SDK does not throw axios errors. It wraps them in its own SnaptradeError, which
 * puts the status at the top level and the response body on `responseBody` — and builds its
 * `message` as the axios message plus a dump of the response HEADERS. So code reading
 * `err.response.data`, which is the obvious thing to write, finds nothing on every SnapTrade
 * failure: the admin panel reported a bare "HTTP 403" while the 104-byte body explaining it sat
 * one property away, and the check deciding whether a stored credential is dead was reading an
 * empty string.
 *
 * Both shapes are handled because netlify functions and fetch calls elsewhere still throw the
 * ordinary axios/undici kind.
 */
export interface HttpErrorDescription {
  status?: number;
  /** Response body as text, whatever form it arrived in. Empty string when there was none. */
  body: string;
  method?: string;
  url?: string;
}

/**
 * Query parameters that must never be shown, logged or pasted into a support thread.
 *
 * The SnapTrade SDK signs requests with credentials in the query string, so the `url` on a thrown
 * error carries the caller's userSecret in plain text. Surfacing that url — which is otherwise the
 * single most useful part of a failure, because it names the endpoint — published a live secret to
 * the admin panel, from where it went straight into a screenshot.
 */
const SECRET_PARAMS = /^(usersecret|secret|consumerkey|key|token|password|signature|apikey)$/i;

/** Keeps the endpoint and drops the credentials. */
export function redactUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const [base, query] = raw.split('?');
  if (!query) return base;

  const safe = query
    .split('&')
    .map((pair) => {
      const [k, ...rest] = pair.split('=');
      if (SECRET_PARAMS.test(k)) return `${k}=[redacted]`;
      // userId is not a credential but it is a user identifier, and it has no diagnostic value in
      // a message that already names the endpoint.
      if (/^userid$/i.test(k)) return `${k}=[redacted]`;
      return `${k}=${rest.join('=')}`;
    })
    .join('&');

  return `${base}?${safe}`;
}

export function describeHttpError(err: unknown): HttpErrorDescription {
  const e = err as {
    status?: number;
    responseBody?: unknown;
    method?: string;
    url?: string;
    response?: { status?: number; data?: unknown };
  } | null;

  const status = e?.status ?? e?.response?.status;
  const raw = e?.responseBody ?? e?.response?.data;
  const body = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : '';

  return { status, body, method: e?.method, url: redactUrl(e?.url) };
}

/**
 * Whether SnapTrade rejected the credentials themselves, as opposed to failing the request.
 *
 * A stored userSecret can stop being valid without anything about it changing: rotating the
 * consumer key, or moving the app between SnapTrade's test and production environments, leaves
 * every secret in Firestore issued against credentials that no longer recognise it. Nothing in the
 * old flow noticed — getOrRegisterCreds returns a cached secret without ever validating it, so the
 * user would keep hitting auth errors forever with no path back.
 */
export function isRejectedCredential(err: unknown): boolean {
  // An outage is never evidence that this user's secret is wrong, and the recovery below deletes
  // it — so a provider having a bad day must not be allowed to look like a bad credential. During
  // an outage a degraded API can answer 401 or "user not found" for reasons that have nothing to
  // do with the caller, and re-registering on that would break connections that were working.
  if (isUpstreamOutage(err)) return false;

  const { status, body } = describeHttpError(err);

  // 401 is unambiguous: the credentials were not accepted.
  if (status === 401) return true;

  /*
   * 403 is not. SnapTrade answers 403 for a rejected signature AND for a request the caller is
   * simply not entitled to make — a connector their subscription does not cover, for instance.
   * Treating every 403 as a dead secret means deleting a working credential and forcing a
   * reconnect because an unrelated entitlement is missing, which is the more damaging mistake of
   * the two. So a 403 has to say so in the body before it counts.
   */
  const haystack = `${err instanceof Error ? err.message : ''} ${body}`.toLowerCase();

  const saysCredential =
    haystack.includes('signature') ||
    haystack.includes('unauthorized') ||
    haystack.includes('unable to verify') ||
    (haystack.includes('user') && haystack.includes('not found'));

  if (status === 403) return saysCredential;
  return saysCredential;
}
