import { useEffect } from 'react';

/**
 * Closes the calling modal/overlay when the user presses Escape.
 * Pass the same `onClose` handler the backdrop click and X button use.
 */
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
