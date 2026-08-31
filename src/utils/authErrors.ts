/**
 * Firebase auth error codes turned into something a person can act on.
 *
 * This module exists because the previous version had one `default:` branch returning
 * "Authentication failed. Please try again." — so every distinct Google failure, including the two
 * that mean the site is misconfigured and the button can never work, rendered as the same
 * unhelpful sentence. That is what was reported: a Google button that reports an authentication
 * failure and gives nobody, user or owner, any way to find out why.
 *
 * Pure and separate so every branch can be tested without a browser or a Firebase project.
 */

/**
 * Codes meaning Google sign-in cannot work in this deployment, for anyone, until someone changes a
 * setting in the Firebase console. Distinct from a user closing the popup or a flaky network:
 * these will fail identically on every retry, so retrying is the wrong advice and continuing to
 * show the button is the wrong behaviour.
 */
const GOOGLE_CONFIG_ERRORS = new Set([
  // The domain the app is served from is not in Firebase Auth → Settings → Authorized domains.
  'auth/unauthorized-domain',
  // Google is not enabled under Firebase Auth → Sign-in method.
  'auth/operation-not-allowed',
  // The web API key is wrong, or the Identity Toolkit API is not enabled on the project.
  'auth/invalid-api-key',
  'auth/api-key-not-valid',
  // No Identity Platform config for this project.
  'auth/configuration-not-found',
]);

/** Codes that mean the person changed their mind. Not failures, and not worth an error message. */
const USER_CANCELLED = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

export function isGoogleConfigError(code: string): boolean {
  return GOOGLE_CONFIG_ERRORS.has(code);
}

export function isUserCancellation(code: string): boolean {
  return USER_CANCELLED.has(code);
}

/**
 * What to show the person who just hit this error.
 *
 * Config errors deliberately do not say "try again" — it will fail the same way every time, and
 * telling someone to retry something that cannot succeed wastes their time and hides the fault
 * from the owner. They point at email sign-in instead, which works regardless.
 */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';

    // --- Google / popup specifics, all of which used to read "Authentication failed" ---
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site, or sign in with an email address below.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
    case 'auth/configuration-not-found':
      // No "we have been notified" — nothing notifies anyone, and a message that claims someone is
      // already on it stops the one person who would have reported it from bothering.
      return 'Google sign-in is not available on this site. Please sign in with an email address below.';
    case 'auth/account-exists-with-different-credential':
      return 'You already have an account with this email using a password. Sign in with your email and password instead.';
    case 'auth/network-request-failed':
      return 'We could not reach the sign-in service. Check your connection and try again.';
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return 'Your browser is blocking the storage sign-in needs. Try a normal (non-private) window, or sign in with an email address below.';
    case 'auth/internal-error':
      return 'The sign-in service returned an error. Please try again in a moment, or use an email address below.';

    default:
      if (code.includes('username')) return code;
      return 'Authentication failed. Please try again.';
  }
}

/** Pulls a Firebase error code off an unknown thrown value. '' when there isn't one. */
export function authErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}
