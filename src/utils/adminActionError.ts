/**
 * Turns a failed admin mutation into a sentence an admin can act on.
 *
 * Every write in the admin panel used to be fired as `void handleSomething(...)` around a
 * `try/finally` with no `catch`. A refused write therefore rejected into nothing: the button
 * stopped spinning, the row did not change, and the only trace was an anonymous
 * "FirebaseError: Missing or insufficient permissions." in the error feed — attributed to the page,
 * not to the action, so the panel that exists to explain failures could not explain its own.
 *
 * The permission case is the one worth naming outright. It nearly always means the rules published
 * to the project are older than the build doing the writing, which is a deploy step, not a bug.
 */
export function describeAdminActionError(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

  if (code === 'permission-denied') {
    return 'Firestore refused the write. The published security rules are probably older than this build — republish firestore.rules.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Firestore was unreachable. Check the connection and try again.';
  }
  if (code === 'not-found') {
    return 'That record no longer exists. Refresh the panel.';
  }
  if (code === 'unauthenticated') {
    return 'The sign-in expired. Sign out and back in.';
  }

  const message = error instanceof Error ? error.message.trim() : '';
  return message || 'Unknown error.';
}

/** `<what> failed: <why>` — the action names itself, so the feed no longer has to guess. */
export function adminActionFailureMessage(what: string, error: unknown): string {
  return `${what} failed: ${describeAdminActionError(error)}`;
}

/**
 * Caps how long the admin panel will wait on one call.
 *
 * The slow half of the load is Netlify functions, which can be cold. `Promise.allSettled` waits for
 * the slowest of them, so without a ceiling a single function that never answers keeps a card
 * spinning for the rest of the session. Rejecting names the call that gave up.
 */
export function withTimeout<T>(promise: Promise<T>, what: string, ms = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The ${what} took longer than ${ms / 1000}s.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
