/**
 * Turning a stream of crashes into a short list of problems.
 *
 * A production error feed is useless raw: one broken render in a component that re-mounts fires
 * hundreds of identical reports, and a handful of them aren't ours at all — a browser extension
 * injecting a script, or Chrome's ResizeObserver notice, which is a warning wearing an error's
 * clothes. What is wanted on the admin panel is "four things are broken", each with a count, not
 * four thousand rows.
 *
 * So every report is reduced to a fingerprint — a stable id for "this same bug" — and anything
 * that isn't ours is dropped before it is ever sent. Both halves are pure functions with no DOM
 * and no network, so they can be tested directly; the transport that uses them lives in
 * errorReporting.ts.
 */

export type ErrorKind = 'render' | 'window' | 'promise' | 'server';

export interface FingerprintInput {
  kind: ErrorKind;
  message: string;
  stack?: string | null;
  /** Server-side only: which handler this came from, so two handlers failing the same way stay apart. */
  scope?: string | null;
}

/*
 * Errors we deliberately never report.
 *
 * Each one is noise that would otherwise dominate the feed:
 *  - "Script error." is what a browser reports for an exception in a cross-origin script it will
 *    not describe. There is nothing actionable in it, ever.
 *  - The ResizeObserver lines are a benign browser notice that layout took an extra frame. Chrome
 *    surfaces it through window.onerror; it breaks nothing.
 *  - Extension schemes are somebody's ad blocker or wallet crashing inside our page.
 *  - Chunk-load failures are already handled by ErrorBoundary, which reloads the page and fixes
 *    them. Reporting them too would mean the feed's loudest entry is the one thing that self-heals.
 *  - The abort/cancel family is a request the user themselves ended by navigating away.
 */
const IGNORED_MESSAGE_PATTERNS: RegExp[] = [
  /^Script error\.?$/i,
  /ResizeObserver loop/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk .* failed/i,
  /^AbortError/i,
  /The operation was aborted/i,
  /^Non-Error promise rejection captured with value: undefined$/i,
];

const IGNORED_STACK_PATTERNS: RegExp[] = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-(web-)?extension:\/\//i,
  /^\s*at <anonymous>:\d+:\d+\s*$/i,
];

/** True when this is worth a row in the admin panel. */
export function shouldReport(input: FingerprintInput): boolean {
  const message = (input.message ?? '').trim();
  if (!message) return false;
  if (IGNORED_MESSAGE_PATTERNS.some((re) => re.test(message))) return false;

  const stack = input.stack ?? '';
  if (stack && IGNORED_STACK_PATTERNS.some((re) => re.test(stack))) return false;

  return true;
}

/*
 * Strip the parts of a message that change between two occurrences of the same bug.
 *
 * "Cannot read properties of undefined (reading 'pnl')" is the same bug every time, but
 * "Request to /api/trades/8fa21c failed with 500 after 1423ms" is the same bug wearing a different
 * id and a different duration on each occurrence. Left alone, one broken endpoint would produce a
 * new fingerprint per request and the grouping would do nothing at all.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s)'"]+/g, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hash>')
    .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, '<date>')
    // No \b around this one: a word boundary needs a non-word character on the far side, so
    // "1423ms" would keep its number and "failed in 1423ms" and "failed in 12ms" would fingerprint
    // as two different bugs. The placeholders substituted above contain no digits, so a bare \d+
    // cannot damage them.
    .replace(/\d+(\.\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * The first frame of the stack that is our own code.
 *
 * The top frame is often inside React or the Firebase SDK, which would group every unrelated crash
 * that happens to surface through the same library into one row. Walking down to the first frame
 * from our own bundle puts the group where the bug is.
 */
export function topAppFrame(stack: string | null | undefined): string {
  if (!stack) return '';

  const lines = stack.split('\n').slice(1); // line 0 repeats the message
  const vendor = /node_modules|\/vendor-|\/firebase-|react-dom|scheduler\.production/i;

  const frames = lines.map((l) => l.trim()).filter((l) => l.startsWith('at ') || l.includes('@'));
  const own = frames.find((f) => !vendor.test(f));
  const chosen = own ?? frames[0] ?? '';

  // Drop the line:column and any cache-busting hash so a redeploy doesn't split the group.
  return chosen
    .replace(/https?:\/\/[^\s)]+\//g, '')
    .replace(/[-.][0-9a-zA-Z_]{8}(\.js)/g, '$1')
    .replace(/:\d+:\d+\)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** FNV-1a, 32-bit. Not a security hash — just a short, stable id for a string. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * A stable id for "this same bug", safe to use as a Firestore document id.
 *
 * Two occurrences of one bug produce the same fingerprint, so the report becomes an increment on a
 * document that already exists rather than a new one — which is what keeps a render loop from
 * writing ten thousand documents, and what makes the admin list readable.
 */
export function fingerprint(input: FingerprintInput): string {
  const parts = [
    input.kind,
    input.scope ?? '',
    normalizeMessage(input.message ?? ''),
    topAppFrame(input.stack),
  ];
  // Two hashes over the same material with different salts: 64 bits of id, so unrelated bugs
  // colliding into one row stays theoretical rather than something that happens by lunchtime.
  const joined = parts.join('|');
  return fnv1a(joined) + fnv1a(`salt:${joined}`);
}

/** Everything an error report carries, once it has been reduced. */
export interface NormalizedError {
  fingerprint: string;
  kind: ErrorKind;
  name: string;
  message: string;
  stack: string;
  scope: string | null;
}

const MAX_STACK_CHARS = 4000;

/** Reduce any thrown value — Error, string, or something stranger — to a reportable shape. */
export function normalizeError(
  thrown: unknown,
  kind: ErrorKind,
  scope: string | null = null,
): NormalizedError {
  const err = thrown as { name?: unknown; message?: unknown; stack?: unknown } | null;

  const name = typeof err?.name === 'string' && err.name ? err.name : 'Error';
  const message =
    typeof err?.message === 'string' && err.message
      ? err.message
      : typeof thrown === 'string'
        ? thrown
        : safeStringify(thrown);
  const stack = typeof err?.stack === 'string' ? err.stack.slice(0, MAX_STACK_CHARS) : '';

  return {
    fingerprint: fingerprint({ kind, message, stack, scope }),
    kind,
    name,
    message: message.slice(0, 1000),
    stack,
    scope,
  };
}

function safeStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  try {
    const json = JSON.stringify(value);
    return json && json !== '{}' ? json.slice(0, 300) : String(value);
  } catch {
    return String(value);
  }
}

/**
 * A URL with its query string and any path segment that looks like an id removed.
 *
 * The page a crash happened on is genuinely useful; the token in its query string is a credential,
 * and a share link's path segment identifies a person. Neither belongs in a log the admin panel
 * renders — the previous time a raw URL was stored somewhere it could be read, it turned out to
 * carry a live SnapTrade user secret.
 */
export function safePath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, 'https://trendchasers.net');
    const path = url.pathname
      .split('/')
      .map((seg) => (/^[0-9a-zA-Z_-]{16,}$/.test(seg) ? '<id>' : seg))
      .join('/');
    return path || '/';
  } catch {
    return '/';
  }
}
