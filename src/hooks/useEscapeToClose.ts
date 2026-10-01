import { useEffect } from 'react';

/**
 * Closes the calling modal/overlay when the user presses Escape.
 * Pass the same `onClose` handler the backdrop click and X button use.
 *
 * Pass `enabled: false` while something else is open on top. Every caller listens on document, so
 * two stacked overlays both answer one Escape: dismissing a confirmation would also close the
 * drawer that asked for it, which reads as the dialog having done something.
 */
export function useEscapeToClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, enabled]);
}
