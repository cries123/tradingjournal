/**
 * How long a dialog takes to leave. Matches .animate-scale-out / .animate-backdrop-out (0.18s);
 * the unmount waits exactly this long, so a longer CSS animation would be cut off mid-fade.
 */
export const EXIT_MS = 180;

/**
 * The decision behind useAnimatedClose, without React in it so it can be tested on its own.
 *
 * Reduced motion closes at once: there is nothing to wait for. Otherwise the first call marks the
 * dialog closing and schedules the real close; any further call while that is pending — Escape
 * pressed during the fade, a double click on Cancel — does nothing, so onClose runs exactly once.
 */
export function createCloser(deps: {
  reduceMotion: boolean;
  isClosing: () => boolean;
  markClosing: () => void;
  schedule: (fn: () => void) => void;
  finish: () => void;
}): () => void {
  return () => {
    if (deps.reduceMotion) {
      deps.finish();
      return;
    }
    if (deps.isClosing()) return;
    deps.markClosing();
    deps.schedule(deps.finish);
  };
}
