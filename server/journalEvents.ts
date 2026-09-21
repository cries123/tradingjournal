import { getAdminFirestore } from './firebaseAdmin';
import type { JournalEvent } from '../src/utils/journalEvents';

/**
 * Storing and reading journal history.
 *
 * The shapes and the English live in src/utils/journalEvents.ts, because the admin panel renders
 * them and this file imports the Firebase Admin SDK. They used to be one file, and a component
 * importing describeEvent from it pulled `firebase-admin` into the browser bundle and took the
 * admin page down with a white screen — the typecheck and the tests were both happy, because
 * neither builds a bundle.
 *
 * Written because a customer cancelled saying their syncs ran, burned the day's allowance and
 * imported nothing, and there was no way to check. syncUsage counts how many syncs were spent and
 * nothing about what any of them returned.
 *
 * Top-level and server-written. The collection appears in no security rule, so Firestore denies
 * every client read and write by default; the Admin SDK bypasses rules and is the only way in or
 * out. No rules deploy is needed to ship it.
 */

export type {
  ClearOutcome,
  JournalEvent,
  JournalEventType,
  SyncOutcome,
} from '../src/utils/journalEvents';

export const JOURNAL_EVENTS = 'journalEvents';

/** How many rows a user's history keeps. Enough to cover a support thread, not a whole year. */
export const MAX_EVENTS_PER_USER = 200;

/**
 * Records an event. Never throws.
 *
 * A failure to write history must not fail the sync that was being recorded — the trader's import
 * is the thing that matters and this is the note about it. Logged loudly instead, so a broken
 * logger shows up in the error feed rather than silently leaving gaps that look like "they never
 * synced".
 */
export async function recordJournalEvent(uid: string, event: JournalEvent): Promise<void> {
  try {
    await getAdminFirestore().collection(`${JOURNAL_EVENTS}/${uid}/events`).add(event);
  } catch (err) {
    console.error(`[journal-events] could not record a ${event.type} for ${uid}:`, err);
  }
}

/** The most recent events for one user, newest first. */
export async function readJournalEvents(uid: string, max = 100): Promise<JournalEvent[]> {
  const snap = await getAdminFirestore()
    .collection(`${JOURNAL_EVENTS}/${uid}/events`)
    .orderBy('at', 'desc')
    .limit(Math.min(max, MAX_EVENTS_PER_USER))
    .get();

  return snap.docs.map((d) => d.data() as JournalEvent);
}
