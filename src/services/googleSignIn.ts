/**
 * Whether the Google sign-in button should be offered at all.
 *
 * Two ways it can be off:
 *
 *  1. Deliberately, via VITE_GOOGLE_SIGNIN_ENABLED=false. An immediate, no-code-change way to pull
 *     the button while a Firebase console problem is being sorted out.
 *
 *  2. Automatically, after a configuration-class failure. auth/unauthorized-domain and
 *     auth/operation-not-allowed mean the button cannot work for anyone in this deployment, so
 *     leaving it up just offers every visitor the same dead end. One failure is enough to know.
 *
 * The automatic half is per-browser, not global: it is a client-side observation, and one person's
 * blocked popup should never take the button away from everybody. The real fix is always the
 * console setting — this only stops the same person hitting the same wall twice.
 */

const DISABLED_KEY = 'trend-chasers-google-signin-unavailable';
/** Long enough to stop repeat dead ends, short enough that a console fix takes effect on its own. */
const DISABLED_TTL_MS = 24 * 60 * 60 * 1000;

/** False turns the button off everywhere, immediately, without touching code. */
function enabledByConfig(): boolean {
  const raw = import.meta.env.VITE_GOOGLE_SIGNIN_ENABLED;
  if (raw === undefined || raw === null || raw === '') return true;
  return String(raw).trim().toLowerCase() !== 'false';
}

function recordedFailureIsCurrent(): boolean {
  try {
    const raw = localStorage.getItem(DISABLED_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { at?: number };
    if (typeof parsed.at !== 'number') return false;
    if (Date.now() - parsed.at > DISABLED_TTL_MS) {
      localStorage.removeItem(DISABLED_KEY);
      return false;
    }
    return true;
  } catch {
    // Unreadable storage should not remove a working button.
    return false;
  }
}

/** Whether to render the Google button. */
export function isGoogleSignInAvailable(): boolean {
  if (!enabledByConfig()) return false;
  return !recordedFailureIsCurrent();
}

/**
 * Remembers that Google sign-in is misconfigured here, so the button stops being offered.
 *
 * Called only for the config-class codes — never for a closed popup, a blocked popup or a network
 * blip, all of which are perfectly capable of succeeding on the next attempt.
 */
export function recordGoogleConfigFailure(code: string): void {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify({ at: Date.now(), code }));
  } catch {
    // Nothing to do — the button simply stays visible.
  }
}

/** Clears the automatic block. Exposed for the admin panel and for tests. */
export function clearGoogleSignInBlock(): void {
  try {
    localStorage.removeItem(DISABLED_KEY);
  } catch {
    // no-op
  }
}
