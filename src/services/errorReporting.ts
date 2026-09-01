import { BUILD_SHA } from '../config/build';
import {
  normalizeError,
  safePath,
  shouldReport,
  type ErrorKind,
} from './errorFingerprint';

/**
 * Sends production crashes somewhere we can see them.
 *
 * Until now the only way a broken deploy surfaced was a user writing in about it — which means the
 * first person to hit a crash is also the person who has to report it, and most of them just leave.
 * This catches render crashes, uncaught exceptions and unhandled promise rejections in the browser,
 * groups them by fingerprint and posts them to /api/report-error, where the admin panel can show
 * them as a short list of problems with counts.
 *
 * Three rules it never breaks, because a crash reporter that misbehaves is worse than none:
 *
 *  1. It cannot crash the app. Every path is wrapped; a failure to report is swallowed.
 *  2. It cannot report itself. A network error posting a report must not trigger another report,
 *     which is how a reporting loop starts.
 *  3. It cannot flood. One crash inside a re-rendering component fires continuously, so the same
 *     fingerprint is sent at most once per window and the session is capped outright.
 */

const ENDPOINT = '/api/report-error';

/** Hard ceiling per page load. Past this, something is looping and more reports add nothing. */
const MAX_PER_SESSION = 8;

/** How long before the same bug is worth reporting again from the same page. */
const REPEAT_WINDOW_MS = 5 * 60_000;

let installed = false;
let sentThisSession = 0;
let reporting = false;
const lastSentAt = new Map<string, number>();

/** True when this exact bug has already been reported recently from this page. */
function throttled(fingerprint: string): boolean {
  const now = Date.now();
  const last = lastSentAt.get(fingerprint);
  if (last !== undefined && now - last < REPEAT_WINDOW_MS) return true;
  lastSentAt.set(fingerprint, now);
  return false;
}

/**
 * The signed-in user's token, when there is one.
 *
 * Sent so the server can attribute a crash to an account and say "this is hitting four users, one
 * of them paying" instead of "this happened 91 times".
 *
 * Imported dynamically so this module can be pulled into the entry bundle — it installs before
 * anything renders — without dragging Firebase's initialisation to the top of startup, and so a
 * project with no Firebase config still reports crashes rather than throwing inside its reporter.
 * It does not move Firebase into a separate chunk: AuthContext imports it statically anyway.
 */
async function currentIdToken(): Promise<string | null> {
  try {
    const { isFirebaseConfigured, getFirebaseAuth } = await import('../lib/firebase');
    if (!isFirebaseConfigured()) return null;
    const user = getFirebaseAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Report one error. Never throws, never rejects.
 *
 * `scope` is for errors we catch ourselves and choose to report — 'broker-sync', 'checkout' — so
 * the same underlying exception surfacing from two features stays two rows.
 */
export async function reportError(
  thrown: unknown,
  kind: ErrorKind = 'window',
  scope: string | null = null,
): Promise<void> {
  // Rule 2: a failure inside this function must not re-enter it.
  if (reporting) return;

  try {
    if (sentThisSession >= MAX_PER_SESSION) return;

    const normalized = normalizeError(thrown, kind, scope);
    if (!shouldReport(normalized)) return;
    if (throttled(normalized.fingerprint)) return;

    reporting = true;
    sentThisSession += 1;

    const token = await currentIdToken();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      // keepalive so a crash that is immediately followed by a navigation or a reload — which is
      // exactly what ErrorBoundary does for chunk errors — still gets its report out.
      keepalive: true,
      body: JSON.stringify({
        fingerprint: normalized.fingerprint,
        kind: normalized.kind,
        name: normalized.name,
        message: normalized.message,
        stack: normalized.stack,
        scope: normalized.scope,
        path: safePath(typeof window === 'undefined' ? '/' : window.location.href),
        release: BUILD_SHA,
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 300),
      }),
    });
  } catch {
    // Reporting is best-effort by definition. If it fails the user must never learn about it.
  } finally {
    reporting = false;
  }
}

/** Fire-and-forget wrapper for call sites that shouldn't await a diagnostic. */
export function reportErrorSilently(thrown: unknown, kind: ErrorKind = 'window', scope: string | null = null): void {
  void reportError(thrown, kind, scope);
}

/**
 * Attach the two browser-level listeners.
 *
 * 'error' catches anything thrown outside React's render — event handlers, timers, module
 * initialisation. 'unhandledrejection' catches the async half, which in this app is most of it:
 * a Firestore write that fails, a fetch to a function that 500s, a broker sync that throws past
 * its own catch. Neither shows up in an ErrorBoundary.
 */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    // event.error is absent for cross-origin script errors; the message alone is filtered out
    // downstream as "Script error." because there is nothing in it worth a row.
    reportErrorSilently(event.error ?? event.message, 'window');
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportErrorSilently(event.reason, 'promise');
  });
}

/** Test seam — resets the per-session throttles. Not used by the app. */
export function __resetErrorReportingForTests(): void {
  installed = false;
  sentThisSession = 0;
  reporting = false;
  lastSentAt.clear();
}
