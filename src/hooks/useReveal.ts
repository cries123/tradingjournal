import { useInView } from './useInView';

/**
 * Marks an element as revealed the first time it scrolls into view, for the .reveal and .bar-in
 * rules in index.css. Once revealed it stays revealed: a card that faded out again every time it
 * left the screen would be motion for its own sake.
 *
 * The element still needs the `reveal` class for the card itself to rise; without it only the bars
 * inside wait for it.
 */
export function useReveal() {
  const { ref, inView } = useInView();
  return { ref, revealProps: { 'data-revealed': inView ? 'true' : 'false' } as const };
}
