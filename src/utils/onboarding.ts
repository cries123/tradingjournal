const STORAGE_KEY = 'trend-chasers-onboarding-done';

/**
 * Whether this browser has seen the intro.
 *
 * Read before the overlay is ever rendered — App decides whether to mount it at all — so it
 * cannot live in the component it gates.
 */
export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /*
     * This read happens while App decides what to mount, so it is on the render path for the very
     * first paint — and in Safari with site data blocked, or a private window, getItem throws.
     * Unguarded it did not degrade the tour, it took the whole app to the crash screen before
     * anything had rendered. The two functions below this one have had a try/catch all along.
     *
     * false means "show the tour": a returning trader seeing it again is a small annoyance, and a
     * new one never seeing it is the version that loses somebody.
     */
    return false;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Nothing to do about it. The tour reappears next visit, which beats throwing out of the
    // handler that dismissed it.
  }
}

const CHECKLIST_KEY = 'trend-chasers-getting-started-hidden';

/**
 * Whether the getting-started card has been waved away.
 *
 * Per browser rather than per account, like the tour above it. The card is help, not a setting,
 * and syncing it would mean a Firestore write on a dismissal that costs nothing to repeat.
 */
export function isGettingStartedHidden(): boolean {
  try {
    return localStorage.getItem(CHECKLIST_KEY) === '1';
  } catch {
    return false;
  }
}

export function hideGettingStarted(): void {
  try {
    localStorage.setItem(CHECKLIST_KEY, '1');
  } catch {
    // Private browsing. It comes back next visit, which is a smaller problem than throwing here.
  }
}
