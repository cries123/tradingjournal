const STORAGE_KEY = 'trend-chasers-onboarding-done';

/**
 * Whether this browser has seen the intro.
 *
 * Read before the overlay is ever rendered — App decides whether to mount it at all — so it
 * cannot live in the component it gates.
 */
export function hasCompletedOnboarding(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function markOnboardingDone(): void {
  localStorage.setItem(STORAGE_KEY, '1');
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
