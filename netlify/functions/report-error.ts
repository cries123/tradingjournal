import type { Handler } from '@netlify/functions';
import { normalizeError, safePath, type ErrorKind } from '../../src/services/errorFingerprint';
import { recordErrorEvent, uidFromAuthHeader } from '../../server/errorReports';

/**
 * Public endpoint that accepts a browser crash report.
 *
 * Public because it has to be: a visitor who never signs in can still hit a broken landing page,
 * and those are the crashes most worth knowing about. Everything that follows from being public is
 * handled here rather than trusted:
 *
 *  - The fingerprint is RECOMPUTED from the message and stack, never taken from the request. A
 *    client-chosen id is a client-chosen document id, and a script sending random ones would write
 *    a new document per request until the daily budget stopped it — turning the grouping that makes
 *    this readable into exactly the unbounded log it was built to avoid.
 *  - The body is capped and every field is truncated, so no single report can be large.
 *  - `kind` is restricted to the three a browser can produce; only server code may write 'server'.
 *  - The uid is taken from a verified token or not at all.
 */

/** Generous for a stack trace, small enough that nobody stores a file here. */
const MAX_BODY_BYTES = 64 * 1024;

const CLIENT_KINDS: ErrorKind[] = ['render', 'window', 'promise'];

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const raw = event.body ?? '';
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Report too large' }) };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const message = str(body.message, 1000).trim();
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  const kind = CLIENT_KINDS.includes(body.kind as ErrorKind) ? (body.kind as ErrorKind) : 'window';
  const stack = str(body.stack, 4000);
  const scope = str(body.scope, 60).trim() || null;

  // Same reduction the client ran, done again on material the server has validated. Because both
  // sides call the identical function, a report from the browser and one recorded server-side for
  // the same underlying bug still land on the same document.
  const normalized = normalizeError({ name: str(body.name, 100) || 'Error', message, stack }, kind, scope);

  try {
    const uid = await uidFromAuthHeader(event.headers.authorization ?? event.headers.Authorization);

    const outcome = await recordErrorEvent({
      fingerprint: normalized.fingerprint,
      kind,
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
      scope,
      path: safePath(str(body.path, 300) || '/'),
      release: str(body.release, 40) || 'unknown',
      userAgent: str(body.userAgent, 300),
      uid,
    });

    // 202 either way. The browser has nothing useful to do with a rejection, and a reporter that
    // retries on failure is how a crash loop becomes a request loop.
    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    };
  } catch (err) {
    // Firestore unreachable, or the service account missing. Logged for the function log; the
    // caller is still told 202, for the same reason.
    console.error('[report-error] failed to record:', err);
    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'unavailable' }),
    };
  }
};
