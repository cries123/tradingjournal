import { getAdminFirestore } from './firebaseAdmin';
import { normalizeUsername, validateUsername } from '../src/utils/usernameValidation';

/**
 * Is this handle free?
 *
 * Server-side because the client cannot answer it. `usernames/{handle}` carries the owning uid, so
 * firestore.rules requires `request.auth != null` to read it — and the one place the question
 * actually matters is the sign-up form, where by definition nobody is signed in yet. The direct
 * read was therefore refused every single time it ran: the "available / already taken" hint has
 * never once appeared on sign-up, and each attempt threw an unhandled FirebaseError into the error
 * feed. It worked in the username-setup modal, where the user is already signed in, which is
 * almost certainly where it was tested.
 *
 * Returns a bare boolean on purpose. The document holds a uid and that is not a stranger's business
 * — knowing a handle is taken is unavoidable on any sign-up form, knowing whose it is is not.
 */

export interface AvailabilityAnswer {
  available: boolean;
  /** Why not, when the handle could never be valid — so the form can say something useful. */
  reason: string | null;
}

export async function checkUsernameAvailable(raw: unknown): Promise<AvailabilityAnswer> {
  if (typeof raw !== 'string') {
    return { available: false, reason: 'Enter a username.' };
  }

  // Validated before the read, not after: an invalid handle is a question about formatting, and
  // answering it costs nothing and touches no database.
  const validation = validateUsername(raw);
  if (!validation.ok) {
    return { available: false, reason: validation.error };
  }

  const snap = await getAdminFirestore()
    .doc(`usernames/${normalizeUsername(validation.normalized)}`)
    .get();

  return { available: !snap.exists, reason: snap.exists ? 'That username is already taken.' : null };
}
