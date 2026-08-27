import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Matches the handful of ways browsers phrase "a lazy-loaded page chunk failed to fetch" —
// Chrome/Edge, Firefox, and Safari all word it differently. This is a known class of transient
// failure for code-split apps behind a CDN: a brief window right after a deploy where the
// already-loaded index.html still points at a chunk hash the CDN has since evicted, or just a
// one-off network blip on that one request. A plain reload almost always fixes it because the
// retry hits the current deploy — so we do that reload automatically instead of making the user
// find the button themselves.
const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .* failed/i;

const RELOAD_GUARD_KEY = 'tc-chunk-reload-at';
const RELOAD_GUARD_WINDOW_MS = 15_000;

/** True at most once per RELOAD_GUARD_WINDOW_MS — prevents a genuinely broken deploy (where
 *  reloading never helps) from reload-looping the page forever. A second chunk error within the
 *  window falls through to the normal fallback UI instead. */
function shouldAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    return true; // sessionStorage unavailable (e.g. some private-browsing modes) — still try once
  }
}

/** Last-resort catch so a render crash shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);

    if (CHUNK_LOAD_ERROR_PATTERN.test(error?.message ?? '') && shouldAutoReload()) {
      window.location.reload();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary text-text-primary p-6">
        <div className="max-w-sm w-full text-center rounded-2xl border border-border/60 bg-bg-secondary/80 p-8">
          <p className="text-4xl mb-4" aria-hidden>
            ⚠️
          </p>
          <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-text-secondary mb-6">
            Your trades are safe. Reload the page to keep journaling — if this keeps happening,
            report it from the Report a bug page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-profit-bright/15 text-profit-bright border border-profit-bright/30 py-2.5 text-sm font-medium hover:bg-profit-bright/25 transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
