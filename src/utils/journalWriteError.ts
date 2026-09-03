/**
 * What to tell a trader when their journal cannot reach Firestore.
 *
 * Separate from the admin panel's version of this on purpose. An admin who sees a denied write
 * wants to know the published rules are stale; a trader wants to know whether their trades are
 * safe and what to press. Neither message is useful to the other person.
 *
 * The permission case is the one that matters most here, and it almost never means what it says.
 * On a phone that has been in the background long enough for the auth token to lapse, Firestore
 * resumes with no credentials and the server answers "insufficient permissions" to work the
 * account's own owner is perfectly entitled to do. Telling that trader they lack permission would
 * be both alarming and false. A reload re-authenticates and it works again.
 */
export function describeJournalWriteError(error: unknown): string {
  const code = typeof error === 'object' && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
  const message = error instanceof Error ? error.message : '';

  // Firestore's async queue latches after any internal failure and every later operation throws
  // this same assertion. Nothing in the tab will work again until it is reloaded.
  if (message.includes('INTERNAL ASSERTION FAILED')) {
    return 'The journal lost its connection and needs a refresh. Reload the page — nothing has been lost.';
  }

  if (code === 'permission-denied' || code === 'unauthenticated') {
    return 'Your sign-in expired while the app was in the background. Reload the page and this will save.';
  }

  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'No connection to the server right now. Your trades are saved on this device and will upload when it returns.';
  }

  if (code === 'resource-exhausted') {
    return 'The journal has hit a storage limit on this device. Reload the page, and get in touch if it keeps happening.';
  }

  return 'Your trades could not be saved just now. Reload the page and try again — nothing has been lost.';
}

/**
 * Whether the failure means this browser tab's Firestore client is finished.
 *
 * A latched async queue never recovers on its own, so retrying is pointless and the only honest
 * advice is to reload. Everything else is worth another attempt.
 */
export function needsReload(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('INTERNAL ASSERTION FAILED')) return true;
  const code = typeof error === 'object' && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
  return code === 'permission-denied' || code === 'unauthenticated';
}
