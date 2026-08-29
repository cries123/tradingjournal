/**
 * One-shot hand-off for "open the journal on a specific screen".
 *
 * The landing page's "Connect a broker" button has to cross a route change to say where it
 * wants to land. Putting that in the URL doesn't survive the trip: navigate('app') pushes the
 * bare '/app' path, wiping any query string set beforehand, and a replaceState afterwards lands
 * too late — JournalApp has already read its initial view by then.
 *
 * sessionStorage instead: set immediately before navigating, read and cleared once on mount, so
 * a later reload of /app opens the dashboard normally rather than being stuck on the broker
 * screen forever.
 */

const KEY = 'tc-pending-app-view';

export type PendingAppView = 'connect-broker';

export function setPendingAppView(view: PendingAppView): void {
  try {
    sessionStorage.setItem(KEY, view);
  } catch {
    // Storage disabled — the journal just opens on the dashboard, which is a fine fallback.
  }
}

/** Returns the pending view and clears it, so it only ever applies to the next mount. */
export function takePendingAppView(): PendingAppView | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value === 'connect-broker' ? value : null;
  } catch {
    return null;
  }
}
