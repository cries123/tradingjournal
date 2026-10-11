import type { PointerEvent } from 'react';

/**
 * Moves the spotlight glow on whichever `.spotlight` card is under the cursor. One listener for the
 * whole page rather than one per card; touch input is ignored, since there is no hover to light.
 *
 * Used by the landing page and by the app shell. The colour is the page's business — see
 * `--spot-rgb` in index.css.
 */
export function trackSpotlight(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const card = (e.target as HTMLElement).closest<HTMLElement>('.spotlight');
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--spot-x', `${e.clientX - box.left}px`);
  card.style.setProperty('--spot-y', `${e.clientY - box.top}px`);
}
