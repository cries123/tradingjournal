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
 * Whether SnapTrade refused the APP, rather than one user.
 *
 * Every request is signed with the app's client id and consumer key, and only some also carry a
 * user's secret. When the app's half is refused, every user fails identically at once, and nothing
 * about any one user's stored secret is wrong. The recovery below used to read that 401 as "this
 * user's secret is dead", delete it, and try to mint a new one — which, with the app's own keys
 * refused, could not succeed. One afternoon of a rejected client id was on course to strip the
 * stored secret from every user who touched a broker screen, and a deleted secret cannot be
 * recovered: SnapTrade's reset call requires the current one.
 *
 * Two signs, either sufficient:
 *  - the reason names the client id or consumer key ("Invalid clientId provided - …", code 1083);
 *  - the refused call was registerUser, which is signed with the app's keys and nothing else, so a
 *    401 or 403 there cannot be about a user.
 *
 * The code alone is deliberately not trusted. SnapTrade does not document 1083, and a code shared
 * with a per-user refusal would turn every dead user secret into an app-wide alarm.
 */
export function isClientRejected(err: unknown): boolean {
  if (isUpstreamOutage(err)) return false;

  const { status, body, url } = describeHttpError(err);
  if (status !== 401 && status !== 403) return false;

  if (/\/snapTrade\/registerUser/i.test(url ?? '')) return true;

  // The first line of the message only: the SDK appends the response headers after it, and a
  // header could mention anything.
  const firstLine = err instanceof Error ? err.message.split('\n')[0] : '';
  return /client ?id|consumer ?key/i.test(`${body} ${firstLine}`);
}

/**
 * Long key-shaped strings, cut to their first four characters.
 *
 * SnapTrade echoes back whatever it was sent as the client id ("Invalid clientId provided - …").
 * A real client id is short and readable (TREND-CHASERS-TNNCU), but when the consumer key was
 * pasted into SNAPTRADE_CLIENT_ID by mistake, this line printed the consumer key — a secret — on
 * the admin's screen and into the stored error row. Twenty-four unbroken letters and digits is
 * longer than any id worth reading and shorter than any key; four characters are enough to tell
 * which key it was.
 */
export function maskKeys(text: string): string {
  return text.replace(/[A-Za-z0-9]{24,}/g, (key) => `${key.slice(0, 4)}…[${key.length} chars hidden]`);
}

/** The reason in a JSON error body, with its code — or the body itself, squeezed onto one line. */
function bodyReason(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; message?: unknown; error?: unknown; code?: unknown } | null;
    const text = [parsed?.detail, parsed?.message, parsed?.error].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    if (text) {
      const code = typeof parsed?.code === 'string' || typeof parsed?.code === 'number' ? parsed.code : null;
      return code !== null ? `${text.trim()} (code ${code})` : text.trim();
    }
  } catch {
    // Not JSON — an HTML error page, a plain-text gateway message. Shown as it came.
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * One line saying who refused what, and why — or null for a failure that never got an answer.
 *
 * "SnapTrade 401 · POST /api/v1/snapTrade/registerUser · Invalid clientId provided - … (code 1083)".
 *
 * Written for the admin panel's error list, which showed a SnapTrade failure as the SDK's message:
 * "Request failed with status code 401" and then forty lines of response headers, with the one
 * sentence that explained it cut off below them. Two things follow from building it from fields
 * rather than from that message. It names the reason. And it groups: the header dump carries a
 * date and a request id, so every occurrence of one fault fingerprinted as a new row.
 *
 * The path only, never the query, because the SDK signs requests in the query string — see
 * SECRET_PARAMS above.
 */
export function upstreamSummary(err: unknown): string | null {
  const { status, body, method, url } = describeHttpError(err);
  if (typeof status !== 'number') return null;

  const path = (url ?? '').split('?')[0].replace(/^https?:\/\/[^/]+/i, '');
  const isSnaptrade =
    (err as { name?: unknown } | null)?.name === 'SnaptradeError' || /snaptrade\.com/i.test(url ?? '');

  return [
    `${isSnaptrade ? 'SnapTrade' : 'HTTP'} ${status}`,
    path ? [method?.toUpperCase(), path].filter(Boolean).join(' ') : '',
    maskKeys(bodyReason(body)),
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500);
}

/**
 * The same failure with upstreamSummary as its message, for anything that records errors.
 *
 * The stack keeps its frames and loses its first line, which on an SDK error is the header dump
 * again. Anything without an HTTP status is returned untouched.
 */
export function readableUpstreamError(err: unknown): unknown {
  const summary = upstreamSummary(err);
  if (!summary) return err;

  const name = err instanceof Error && err.name ? err.name : 'Error';
  const frames = (err instanceof Error && typeof err.stack === 'string' ? err.stack : '')
    .split('\n')
    .filter((line) => line.trim().startsWith('at '));

  const readable = new Error(summary);
  readable.name = name;
  readable.stack = [`${name}: ${summary}`, ...frames].join('\n');
  return readable;
}

/**
 * Whether SnapTrade rejected the credentials themselves, as opposed to failing the request.
 *
 * A stored userSecret can stop being valid without anything about it changing: moving the app
 * between SnapTrade's test and production environments leaves every secret in Firestore issued by
 * an environment that no longer knows the user. Nothing in the old flow noticed — getOrRegisterCreds
 * returns a cached secret without ever validating it, so the user would keep hitting auth errors
 * forever with no path back.
 *
 * A true answer starts recovery (server/snaptradeCredentials.ts), which tries to register the user
 * again. That is no longer destructive — the stored secret is only replaced once SnapTrade has
 * issued a new one — but it is still a SnapTrade call per failure, so this stays strict.
 */
export function isRejectedCredential(err: unknown): boolean {
  // An outage is never evidence that this user's secret is wrong. During one a degraded API can
  // answer 401 or "user not found" for reasons that have nothing to do with the caller, and the
  // admin panel would mark every such user as needing to reconnect.
  if (isUpstreamOutage(err)) return false;

  // Nor is a refusal of the app's own keys — see isClientRejected. That one is everybody at once.
  if (isClientRejected(err)) return false;

  const { status, body } = describeHttpError(err);

  // Otherwise a 401 is unambiguous: this user's credentials were not accepted.
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
