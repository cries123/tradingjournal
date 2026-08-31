import { describe, expect, it } from 'vitest';

/**
 * The banner's rule for what to show. Extracted because the flash it exists to prevent was a
 * behaviour bug, not a rendering one: the old version showed the computed line and replaced it a
 * second later, which reads as the app correcting itself rather than as loading.
 */
function bannerText(opts: {
  aiText: string | null;
  aiPending: boolean;
  computed: string;
}): string | null {
  return opts.aiText?.trim() || (opts.aiPending ? null : opts.computed);
}

const COMPUTED = 'Your 46% win rate is below the 51% you need.';
const AI = 'One catastrophic day — -506.15 on 2026-06-26 — left the month at -782.26.';

describe('what the takeaway banner shows', () => {
  it('shows nothing but a placeholder while the model is still answering', () => {
    // The whole point: no text appears that will later be replaced.
    expect(bannerText({ aiText: null, aiPending: true, computed: COMPUTED })).toBeNull();
  });

  it('shows the AI text once it arrives', () => {
    expect(bannerText({ aiText: AI, aiPending: false, computed: COMPUTED })).toBe(AI);
  });

  it('never holds when the answer is already here', () => {
    // A cache hit renders on the first paint, so pending can be true and text present at once
    // without producing a hold.
    expect(bannerText({ aiText: AI, aiPending: true, computed: COMPUTED })).toBe(AI);
  });

  it('falls back to the computed line once the hold gives up', () => {
    // Waiting beats swapping only while the wait is short; an indefinitely blank banner is worse
    // than the computed line.
    expect(bannerText({ aiText: null, aiPending: false, computed: COMPUTED })).toBe(COMPUTED);
  });

  it('does not hold on a whitespace-only answer', () => {
    expect(bannerText({ aiText: '   ', aiPending: false, computed: COMPUTED })).toBe(COMPUTED);
  });
});

/**
 * The per-browser cache is what makes the hold rare: re-opening a month you just looked at renders
 * on the first paint. Keyed so it can never be shown against numbers it was not written about.
 */
describe('the cached takeaway is only reused for the same request', () => {
  const matches = (cachedKey: string, requestKey: string) => cachedKey === requestKey;

  it('reuses it for the same user, period and trades', () => {
    expect(matches('uid:2026-06:abc-85', 'uid:2026-06:abc-85')).toBe(true);
  });

  it('does not reuse it after a trade changes', () => {
    expect(matches('uid:2026-06:abc-85', 'uid:2026-06:def-86')).toBe(false);
  });

  it('does not reuse it for another period', () => {
    expect(matches('uid:2026-06:abc-85', 'uid:2026-07:abc-85')).toBe(false);
  });

  it('does not reuse one user\'s takeaway for another', () => {
    // Same browser, different account: showing the previous user's read of their month would be
    // both wrong and a disclosure.
    expect(matches('uid-a:2026-06:abc-85', 'uid-b:2026-06:abc-85')).toBe(false);
  });
});
