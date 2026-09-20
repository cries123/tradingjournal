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
  /**
   * Three states, not two: yes, no, and never said.
   *
   * It used to collapse to a boolean, and that stopped being adequate the day the recap started
   * defaulting ON for the plans that are sold it. A tier with aiReview and no document gets the
   * email; a tier with aiReview and an explicit `false` does not. Collapsing "never said" into
   * "no" would have left the Settings checkbox unticked for exactly the people who are receiving
   * one every Sunday — the UI quietly contradicting the product.
   */
  recap: boolean | null;
}

export const DEFAULT_EMAIL_PREFS: EmailPrefs = { recap: null };

/**
 * Whether the recap is on, given the stored preference and whether the plan includes it.
 *
 * The same rule the scheduled job applies, written once so the checkbox and the send cannot
 * disagree. See recapRecipients in netlify/functions/weekly-recap.ts.
 */
export function recapIsOn(prefs: EmailPrefs | null, planIncludesIt: boolean): boolean {
  if (prefs?.recap === true) return true;
  if (prefs?.recap === false) return false;
  return planIncludesIt;
}

export async function fetchEmailPrefs(uid: string): Promise<EmailPrefs> {
  if (!isFirebaseConfigured()) return DEFAULT_EMAIL_PREFS;

  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'emailPrefs', uid));
    const data = snap.data() as { recap?: unknown } | undefined;
    if (data?.recap === true) return { recap: true };
    if (data?.recap === false) return { recap: false };
    return { recap: null };
  } catch {
    // Offline, or rules denying a document that doesn't exist yet. "Never said" rather than "no",
    // so a transient failure cannot make a Diamond account's toggle read as off while the job is
    // still sending them one.
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
