import { getAdminFirestore } from './firebaseAdmin';
import type { SyncOutcome } from '../src/utils/journalEvents';

/**
 * Every sync, across every user, newest first.
 *
 * The per-user history (journalEvents/{uid}/events) answers "what happened to this person", one
 * person at a time. It could not answer "what happened this morning": a Robinhood sync that timed
 * out and a Schwab connection returning nothing were both found by a customer writing in, then by
 * opening users one by one. A cross-user read of that subcollection would need a collection-group
 * index deployed by hand, so the sync rows are mirrored into one top-level collection instead,
 * where ordering by time is a single-field index Firestore keeps on its own.
 *
 * Written beside the user's own row and never instead of it. Never throws.
 */
export const SYNC_FEED = 'syncFeed';

export interface SyncFeedRow {
  id?: string;
  uid: string;
  at: string;
  sync: SyncOutcome;
  /** The user's own history row, so the admin can delete it from the user's card. */
  eventId: string | null;
}

export async function writeSyncFeed(row: Omit<SyncFeedRow, 'id'>): Promise<void> {
  try {
    await getAdminFirestore().collection(SYNC_FEED).add(row);
  } catch (err) {
    console.error('[sync-feed] could not record a sync:', err);
  }
}

export async function readSyncFeed(max = 150): Promise<SyncFeedRow[]> {
  const snap = await getAdminFirestore().collection(SYNC_FEED).orderBy('at', 'desc').limit(max).get();
  return snap.docs.map((d) => ({ ...(d.data() as SyncFeedRow), id: d.id }));
}
