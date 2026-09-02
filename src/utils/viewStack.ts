/**
 * A back stack for the screens inside the journal, which are view state rather than URL routes.
 *
 * Every one of those screens had `onBack={() => setAppView('dashboard')}` hardcoded, so Brokers →
 * "Request a broker" → back put you on the dashboard rather than back in the broker list you were
 * looking at. Back has to mean the screen before this one, not one particular screen.
 */
const MAX_DEPTH = 10;

export function currentView<T>(stack: readonly T[], fallback: T): T {
  return stack.length > 0 ? stack[stack.length - 1] : fallback;
}

export function pushView<T>(stack: readonly T[], next: T, max = MAX_DEPTH): T[] {
  if (stack.length > 0 && stack[stack.length - 1] === next) return [...stack];

  // Navigating to the screen directly behind this one IS going back. Without this, bouncing
  // between two screens grows the stack until the cap silently eats the trail behind it.
  if (stack.length > 1 && stack[stack.length - 2] === next) return stack.slice(0, -1);

  const grown = [...stack, next];
  return grown.length > max ? grown.slice(grown.length - max) : grown;
}

export function popView<T>(stack: readonly T[], fallback: T): T[] {
  const popped = stack.slice(0, -1);
  return popped.length > 0 ? popped : [fallback];
}
