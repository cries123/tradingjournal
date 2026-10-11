import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/**
 * Whether the visitor has asked the operating system for less motion.
 *
 * For the animations driven from JavaScript — counters, the hero's sync, typed text. CSS animations
 * are switched off by the reduced-motion block in index.css; these have to ask. Live, so turning the
 * setting on mid-visit stops them without a reload.
 */
export function usePrefersReducedMotion(): boolean {
  // Server snapshot false: the prerender runs in a real browser, so this only matters to tests.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
