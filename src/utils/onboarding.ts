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
