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
 * Records an event. Never throws. Returns the new row's id, or null when it could not be written.
 *
 * A failure to write history must not fail the sync that was being recorded — the trader's import
 * is the thing that matters and this is the note about it. Logged loudly instead, so a broken
 * logger shows up in the error feed rather than silently leaving gaps that look like "they never
 * synced".
 */
export async function recordJournalEvent(uid: string, event: JournalEvent): Promise<string | null> {
  try {
    const ref = await getAdminFirestore().collection(`${JOURNAL_EVENTS}/${uid}/events`).add(event);
    return ref.id;
  } catch (err) {
    console.error(`[journal-events] could not record a ${event.type} for ${uid}:`, err);
    return null;
  }
}

/**
 * The browser's word that a manual sync's trades were saved, and how many were new. Never throws.
 *
 * The sync row is written before the answer goes out, by the only side that knows what the pull
 * found; the save happens on the other side of the network, in the browser. Without this the row
 * could only ever say what was sent, and "8,790 trades out" stood in a trader's history for an
 * answer that had died at Netlify's time limit. A row that is never confirmed now says so.
 *
 * Scoped by uid in the path, so a caller can only ever confirm their own rows.
 */
export async function confirmJournalEvent(uid: string, id: string, fresh: number): Promise<void> {
  try {
    await getAdminFirestore()
      .doc(`${JOURNAL_EVENTS}/${uid}/events/${id}`)
      .update({ 'sync.fresh': fresh, 'sync.landed': true });
  } catch (err) {
    console.warn(`[journal-events] could not confirm sync ${id} for ${uid}:`, err);
  }
}

/** The most recent events for one user, newest first. */
export async function readJournalEvents(uid: string, max = 100): Promise<JournalEvent[]> {
  const snap = await getAdminFirestore()
    .collection(`${JOURNAL_EVENTS}/${uid}/events`)
    .orderBy('at', 'desc')
    .limit(Math.min(max, MAX_EVENTS_PER_USER))
    .get();

  // With the document id, so the admin panel can name a row to delete.
  return snap.docs.map((d) => ({ ...(d.data() as JournalEvent), id: d.id }));
}

/**
 * Deletes named rows from one user's history. Returns how many existed and were removed.
 *
 * For support: a sync that timed out still recorded "8,790 trades out", and that row then sits in
 * the trader's own history claiming an import that never reached their journal. The ids are
 * checked by the caller (parseEventIds); a row already gone is simply not counted.
 */
export async function deleteJournalEvents(uid: string, ids: string[]): Promise<number> {
  const db = getAdminFirestore();
  const refs = ids.map((id) => db.doc(`${JOURNAL_EVENTS}/${uid}/events/${id}`));
  const snaps = await Promise.all(refs.map((ref) => ref.get()));
  const existing = refs.filter((_, i) => snaps[i].exists);
  if (existing.length === 0) return 0;

  const batch = db.batch();
  for (const ref of existing) batch.delete(ref);
  await batch.commit();
  return existing.length;
}
