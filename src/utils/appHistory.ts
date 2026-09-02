/**
 * Where "back" actually goes.
 *
 * Every in-page back link said "Back to home" and went to the landing page, whatever you had come
 * from. Open Guides, click into a tutorial, press back, and you were on the home page rather than
 * back in the list you were reading — so returning to the list meant navigating to it again.
 *
 * The previous screen is recorded on the history entry itself rather than in a module-level stack.
 * The browser hands the right state back on a real back or forward press, which a stack of our own
 * would have to reconstruct — and would get wrong the moment someone used the browser's own
 * controls, or restored a tab.
 *
 * `depth` counts pushes made inside the app, which is what separates "there is a screen behind
 * this one" from "this is where the visitor arrived", the case where back has to mean home instead
 * of leaving the site.
 */
export interface AppHistoryState {
  depth: number;
  from: string;
}

/** Reads our own state off a history entry, ignoring anything that is not ours. */
export function previousPathFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const { depth, from } = state as Partial<AppHistoryState>;
  if (typeof depth !== 'number' || depth < 1) return null;
  if (typeof from !== 'string' || !from.startsWith('/')) return null;
  return from;
}

export function nextHistoryState(currentState: unknown, currentPath: string): AppHistoryState {
  const depth =
    typeof currentState === 'object' && currentState !== null
      ? (currentState as Partial<AppHistoryState>).depth
      : undefined;
  return { depth: (typeof depth === 'number' ? depth : 0) + 1, from: currentPath };
}

/** The single place the app adds a history entry, so back is recorded no matter who navigated. */
export function pushAppHistory(path: string): void {
  window.history.pushState(
    nextHistoryState(window.history.state, window.location.pathname),
    '',
    path,
  );
}

/** The in-app screen behind this one, or null when the visitor landed here directly. */
export function previousAppPath(): string | null {
  return previousPathFromState(window.history.state);
}
