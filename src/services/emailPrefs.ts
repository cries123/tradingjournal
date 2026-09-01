import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

/**
 * Who wants the weekly recap, in a collection of their own.
 *
 * Not a field on the user's settings document, deliberately. The scheduled job needs to ask "who
 * is opted in?" across everybody, and a field inside `users/{uid}/settings` would make that a
 * collectionGroup query — which Firestore refuses until somebody creates an index by hand in the
 * console. A top-level collection with one boolean rides the automatic single-field index, so the
 * job works the moment it deploys.
 *
 * `lastRecapSentAt` also lives here, written only by the scheduled function. Every client write
 * merges, and the rules pin which keys a user may touch, so opting in and out can never erase the
 * record that stops a second send.
 */

export interface EmailPrefs {
  recap: boolean;
}

export const DEFAULT_EMAIL_PREFS: EmailPrefs = { recap: false };

export async function fetchEmailPrefs(uid: string): Promise<EmailPrefs> {
  if (!isFirebaseConfigured()) return DEFAULT_EMAIL_PREFS;

  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'emailPrefs', uid));
    const data = snap.data() as { recap?: unknown } | undefined;
    return { recap: data?.recap === true };
  } catch {
    // Offline, or rules denying a document that doesn't exist yet. Off is the safe answer for an
    // opt-in: it never shows somebody a toggle claiming they subscribed to something.
    return DEFAULT_EMAIL_PREFS;
  }
}

export async function setRecapOptIn(uid: string, recap: boolean): Promise<void> {
  if (!isFirebaseConfigured()) return;

  await setDoc(
    doc(getFirebaseDb(), 'emailPrefs', uid),
    { uid, recap, updatedAt: new Date().toISOString() },
    // merge, so opting out never deletes lastRecapSentAt and re-opens the door to a duplicate send.
    { merge: true },
  );
}
