/** The three chapters of "how it works", in the order the product is used. */
export const CHAPTERS = [
  { id: 'connect', label: 'Connect' },
  { id: 'see', label: 'See' },
  { id: 'fix', label: 'Fix' },
] as const;

/**
 * Where the reader is through the chapters, 0 to 1, from where they sit on the page.
 *
 * Starts filling a quarter of a screen before the first chapter reaches the top, and is full when the
 * last chapter's bottom reaches the bottom of the screen — so "full" means "you have read it all".
 */
export function chapterProgress(scrollY: number, viewport: number, firstTop: number, lastBottom: number): number {
  const start = firstTop - viewport * 0.25;
  const end = lastBottom - viewport;
  if (end <= start) return scrollY >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (scrollY - start) / (end - start)));
}

/** The last chapter whose top has passed 45% of the way down the screen; the first before any has. */
export function currentChapter(tops: number[], viewport: number): number {
  let current = 0;
  tops.forEach((top, i) => {
    if (top < viewport * 0.45) current = i;
  });
  return current;
}
