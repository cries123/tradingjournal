import { getAdminFirestore } from './firebaseAdmin';

/**
 * What happened to somebody's journal, and when.
 *
 * Written because a customer cancelled saying their syncs ran, burned the day's allowance, and
 * imported nothing — and there was no way to check. syncUsage counts how many syncs were spent
 * and nothing about what any of them returned, so the only evidence was the trade total, which
 * cannot tell an empty sync from one that worked.
 *
 * Deliberately a record of OUTCOMES rather than a debug log. Each row answers the question a
 * support conversation actually asks: you synced at this time, the broker sent this many
 * activities, this many round trips came out, and this is why the rest did not.
 *
 * Top-level and server-written. The collection appears in no security rule, so Firestore denies
 * every client read and write by default; the Admin SDK bypasses rules and is the only way in or
 * out. That also means no rules deploy is needed to ship this.
 */

export const JOURNAL_EVENTS = 'journalEvents';

/** How many rows a user's history keeps. Enough to cover a support thread, not a whole year. */
export const MAX_EVENTS_PER_USER = 200;

export type JournalEventType = 'sync' | 'clear';

export interface SyncOutcome {
  /** The connection this was, so a two-account trader can see which one is quiet. */
  accountId: string;
  institution: string | null;
  /** Raw activities the broker returned before any matching. Zero means the feed was empty. */
  activityCount: number;
  /** Round-trip trades the matcher built from them. This is what reached the browser. */
  tradesReturned: number;
  /** Closes with no opening fill to pair against — the usual reason activities outnumber trades. */
  unmatchedCloses: number;
  /** Activities the matcher could not use at all. */
  ignored: number;
  /**
   * Those same activities broken down by type.
   *
   * The most diagnostic field here by a distance: "the broker sent 12 activities and all 12 were
   * DIVIDEND" closes a support ticket in one line, where a bare count of 12 starts an
   * investigation.
   */
  ignoredByType: Record<string, number>;
  /** True when the pull hit its page cap, so older history was not fetched. */
  truncated: boolean;
  /** Syncs left after this one, so a support thread can see the allowance running down. */
  syncsRemaining: number;
}

export interface ClearOutcome {
  /** Trades deleted, and the journal they were deleted from. */
  tradesRemoved: number;
  journalId: string;
  journalName: string | null;
}

export interface JournalEvent {
  type: JournalEventType;
  at: string;
  sync?: SyncOutcome;
  clear?: ClearOutcome;
}

/** "8 DIVIDEND and 2 FEE", biggest first — the shape of what the broker actually sent. */
function describeIgnored(byType: Record<string, number>): string {
  const parts = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type, n]) => `${n} ${type}`);
  return parts.length > 0 ? parts.join(", ") : "activity";
}

/**
 * One line of plain English for a row, so the admin panel is not a JSON dump.
 *
 * Here rather than in the component because it is the interpretation, not the presentation: "12
 * activities, 0 trades" is data, and "the broker sent 12 activities but none of them paired into a
 * round trip" is the answer to the support ticket. Pure, and tested.
 */
export function describeEvent(event: JournalEvent): string {
  if (event.type === 'clear') {
    const c = event.clear;
    if (!c) return 'Cleared a journal.';
    return `Cleared "${c.journalName ?? c.journalId}" — ${c.tradesRemoved.toLocaleString()} ${
      c.tradesRemoved === 1 ? 'trade' : 'trades'
    } deleted.`;
  }

  const s = event.sync;
  if (!s) return 'Synced.';

  const where = s.institution ?? 'a broker';

  if (s.activityCount === 0) {
    return `Synced ${where} — the broker returned no activity at all. A sync was spent for nothing.`;
  }

  if (s.tradesReturned === 0) {
    const why =
      s.unmatchedCloses > 0
        ? ` ${s.unmatchedCloses} ${s.unmatchedCloses === 1 ? 'close had' : 'closes had'} no opening fill to pair with.`
        : s.ignored > 0
          ? ` All ${s.ignored} were ${describeIgnored(s.ignoredByType)} the matcher could not use.`
          : '';
    return `Synced ${where} — ${s.activityCount} activities came back but nothing paired into a trade.${why} A sync was spent for nothing.`;
  }

  const lost = s.activityCount - s.tradesReturned * 2;
  const tail =
    s.unmatchedCloses > 0
      ? ` ${s.unmatchedCloses} ${s.unmatchedCloses === 1 ? 'close' : 'closes'} had no opening fill.`
      : lost > 0 && s.ignored > 0
        ? ` ${s.ignored} activities were unusable.`
        : '';

  return `Synced ${where} — ${s.activityCount} activities in, ${s.tradesReturned} ${
    s.tradesReturned === 1 ? 'trade' : 'trades'
  } out.${tail}${s.truncated ? ' Hit the page cap, so older history was not fetched.' : ''}`;
}

/** True when this sync gave the trader nothing, which is the row a support thread is looking for. */
export function wasWasted(event: JournalEvent): boolean {
  return event.type === 'sync' && (event.sync?.tradesReturned ?? 0) === 0;
}

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
