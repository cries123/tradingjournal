import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { createCloser, EXIT_MS } from '../utils/closer';

/**
 * Lets a dialog play its way out before the parent unmounts it.
 *
 * Every dialog here is rendered as `{open && <Dialog onClose={…} />}`, so the moment onClose runs
 * it is gone — which is why they all arrived with a scale-in and vanished in a single frame. This
 * returns `close`, which marks the dialog as closing (it swaps to .animate-scale-out and stops
 * taking clicks) and calls the real onClose once that has played.
 *
 * Every way out has to go through `close`: the X, Cancel, the backdrop, Escape and a successful
 * save. One that calls onClose directly skips the animation, which is the bug the day drawer had
 * on Escape.
 */
export function useAnimatedClose(onClose: () => void): { closing: boolean; close: () => void } {
  const reduceMotion = usePrefersReducedMotion();
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const close = useCallback(() => {
    createCloser({
      reduceMotion,
      isClosing: () => timer.current !== null,
      markClosing: () => setClosing(true),
      schedule: (fn) => {
        timer.current = setTimeout(() => {
          timer.current = null;
          fn();
        }, EXIT_MS);
      },
      finish: () => {
        onCloseRef.current();
        // For a panel that stays mounted and is hidden by a prop (the assistant dock), so it opens
        // again as itself rather than mid-exit. A dialog that unmounted on onClose ignores this.
        setClosing(false);
      },
    })();
  }, [reduceMotion]);

  return { closing, close };
}
