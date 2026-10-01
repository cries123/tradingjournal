import type { Handler, HandlerResponse } from '@netlify/functions';
import { LoginError, REFUSAL, signInWithUsername } from '../../server/usernameLogin';
import { checkUsernameAvailable } from '../../server/usernameAvailability';

/**
 * Unauthenticated by necessity — this is what somebody calls when they cannot sign in yet.
 *
 * Only reached when the identifier typed into the form has no "@" in it. An email address takes
 * the ordinary client-side path to Firebase and never arrives here, so the password of a person
 * signing in the usual way does not pass through this function at all.
 */
export const handler: Handler = async (event): Promise<HandlerResponse> => {
  const json = (statusCode: number, body: unknown): HandlerResponse => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body: { username?: unknown; password?: unknown; action?: unknown };
  try {
    body = JSON.parse(event.body ?? '{}') as typeof body;
  } catch {
    return json(400, { error: REFUSAL });
  }

  /*
   * Is this handle free? Answered here because it cannot be answered anywhere else.
   *
   * usernames/{handle} carries the owning uid, so the rules require auth to read it — and the
   * one place the question matters is the sign-up form, where nobody is signed in yet. The
   * client read was refused every single time: the hint never appeared, and each attempt threw
   * an unhandled FirebaseError into the error feed.
   *
   * No password, no token, and a bare boolean back. Knowing a handle is taken is unavoidable on
   * any sign-up form; knowing whose it is would be a different thing entirely.
   */
  if (body.action === 'available') {
    try {
      return json(200, await checkUsernameAvailable(body.username));
    } catch (err) {
      console.error('[username-login] availability check failed:', err);
      // Treated as available rather than taken: claimUsername runs inside a transaction and is
      // the thing that actually decides, so a hint that fails open costs a rejected submit, and
      // one that fails closed tells somebody their own free handle is gone.
      return json(200, { available: true, reason: null });
    }
  }

  if (typeof body.username !== 'string' || typeof body.password !== 'string') {
    return json(400, { error: REFUSAL });
  }

  try {
    return json(200, await signInWithUsername(body.username, body.password));
  } catch (err) {
    if (err instanceof LoginError) {
      return json(err.statusCode, { error: err.message });
    }
    // Deliberately vague, and logged rather than returned: the failure modes here are "no such
    // handle" and "no such password", and saying which is the whole thing this endpoint avoids.
    console.error('[username-login] failed:', err);
    return json(500, { error: 'Could not sign you in right now. Try again shortly.' });
  }
};
