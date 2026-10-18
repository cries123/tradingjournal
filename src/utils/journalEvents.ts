/**
 * What happened to somebody's journal — the shapes, and how to say them in English.
 *
 * Pure and in src/ because the admin panel renders these, and the storage half lives in
 * server/journalEvents.ts next to the Admin SDK. They were one file, and the panel imported
 * describeEvent from it — which pulled `firebase-admin` into the browser bundle and took the whole
 * admin page down with a white screen. Nothing caught it: the typecheck was happy, the tests do
 * not build a bundle, and the failure only exists in a browser.
 *
 * So the rule this file exists to keep: anything a component renders lives here, and anything that
 * touches Firestore stays on the server side. src/services/serverImports.test.ts fails the build
 * if a file under src/ ever imports a value from server/ again.
 */

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
  /**
   * An older pull hit its page cap and left the oldest history out. No longer written: a pull that
   * stops early now records `partial` and `resumeFrom` instead, and nothing is left out for good.
   */
  truncated?: boolean;
  /** Syncs left after this one, so a support thread can see the allowance running down. Absent on an automatic run, which spends none. */
  syncsRemaining?: number;
  /** Sales recorded as shorts for want of a prior buy in the window. */
  assumedShorts?: number;
  /** Lots the feed left open — the positions that are not trades yet. */
  openPositions?: number;
  /** Why the server asked for the window it did: 'first-sync', 'repairing', 'window', 'widened-for-open-position'. */
  windowReason?: string;
  /** The first day the pull asked for, or null for the whole history. */
  windowStart?: string | null;
  /** The morning import rather than the Sync button. */
  automatic?: boolean;
  /** Of tradesReturned, the ones that were not already in the journal — known only after dedupe. */
  fresh?: number;
  /** The pull ran out of time and handed over the history before `resumeFrom`; the rest is unread. */
  partial?: boolean;
  /** The first day the pull did not read, when it was partial. */
  resumeFrom?: string | null;
  /** What stopped a partial pull: 'budget', 'page-cap', 'response-size' or 'unknown-total'. */
  stoppedBy?: string;
  /**
   * Whether the trades reached a journal.
   *
   * A manual sync writes this row before answering, and the browser is what saves the trades. A
   * row that said "8,790 trades out" for an answer the browser never received — the function had
   * been cut off at Netlify's limit — is what this field exists for. False when written; true once
   * the browser confirms the save, at which point `fresh` is also known. Absent on automatic runs,
   * which write the trades themselves, and on rows older than this field.
   */
  landed?: boolean;
}

export interface ClearOutcome {
  /** Trades deleted, and the journal they were deleted from. */
  tradesRemoved: number;
  journalId: string;
  journalName: string | null;
}

export interface JournalEvent {
  /** The Firestore document id. Present on rows read back, so support can delete one. */
  id?: string;
  type: JournalEventType;
  at: string;
  sync?: SyncOutcome;
  clear?: ClearOutcome;
}

/**
 * The most rows one delete may name. A support clean-up is a handful of bad syncs; a number
 * past this is a mistake or a script, and the history only keeps a couple of hundred anyway.
 */
export const MAX_EVENT_DELETES = 50;

/** What `.add()` mints: twenty letters and digits. Anything else is not one of these rows. */
const EVENT_ID = /^[A-Za-z0-9]{1,64}$/;

/** True for an id the browser could only have been handed by the sync that wrote the row. */
export function isJournalEventId(value: unknown): value is string {
  return typeof value === 'string' && EVENT_ID.test(value);
}

/**
 * The ids a delete request named, or null when the request is not one to act on.
 *
 * All or nothing: one malformed id refuses the lot, rather than deleting the valid part of a list
 * that was evidently built wrong. Duplicates collapse, so the count reported back is real.
 */
export function parseEventIds(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  if (!input.every((id): id is string => typeof id === 'string' && EVENT_ID.test(id))) return null;
  const ids = [...new Set(input)];
  return ids.length > MAX_EVENT_DELETES ? null : ids;
}

/** "8 DIVIDEND, 2 FEE", biggest first — the shape of what the broker actually sent. */
function describeIgnored(byType: Record<string, number>): string {
  const parts = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type, n]) => `${n} ${type}`);
  return parts.length > 0 ? parts.join(', ') : 'activity';
}

/**
 * One line of plain English for a row, so the admin panel is not a JSON dump.
 *
 * The interpretation, not the presentation: "12 activities, 0 trades" is data, and "the broker
 * sent 12 activities and all 12 were DIVIDEND" is the reply to the support ticket.
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
  const verb = s.automatic ? `Morning import from ${where}` : `Synced ${where}`;
  // An automatic run spends nothing, and a cut-short pull is refunded, so "spent for nothing" is
  // only true of a Sync button press that reached the end of its window.
  const wasted = s.automatic || s.partial ? '' : ' A sync was spent for nothing.';
  const open = s.openPositions ? ` ${s.openPositions} ${s.openPositions === 1 ? 'position is' : 'positions are'} still open.` : '';
  const scope =
    (s.windowReason === 'first-sync' || s.windowReason === 'repairing') && !s.partial
      ? ' Read the full history.'
      : s.windowReason === 'resuming'
        ? ' Carried on from where the last pull stopped.'
        : s.windowReason === 'widened-for-open-position'
          ? ' Reached back to an open position.'
          : '';
  // The resume point is the fact a support thread needs: it says how far the journal is filled in.
  const partial = s.partial
    ? ` Ran out of time${s.resumeFrom ? ` at ${s.resumeFrom}` : ''}; the next sync continues from there.`
    : '';

  if (s.activityCount === 0) {
    return `${verb} — the broker returned no activity at all.${open}${scope}${partial}${wasted}`;
  }

  if (s.tradesReturned === 0) {
    const why =
      s.unmatchedCloses > 0
        ? ` ${s.unmatchedCloses} ${s.unmatchedCloses === 1 ? 'close had' : 'closes had'} no opening fill to pair with.`
        : s.ignored > 0
          ? ` All ${s.ignored} were ${describeIgnored(s.ignoredByType)} the matcher could not use.`
          : '';
    return `${verb} — ${s.activityCount} activities came back but nothing paired into a trade.${why}${open}${scope}${partial}${wasted}`;
  }

  const lost = s.activityCount - s.tradesReturned * 2;
  const tail =
    s.unmatchedCloses > 0
      ? ` ${s.unmatchedCloses} ${s.unmatchedCloses === 1 ? 'close' : 'closes'} had no opening fill.`
      : lost > 0 && s.ignored > 0
        ? ` ${s.ignored} activities were unusable.`
        : '';

  const fresh = s.fresh != null ? ` ${s.fresh} new.` : '';
  // The row claims trades went out. Whether they arrived is a separate fact, and the one that
  // matters when the journal is still empty: see `landed` on the shape.
  const landed = s.landed === false ? ' Not confirmed as saved by the browser.' : '';
  return `${verb} — ${s.activityCount} activities in, ${s.tradesReturned} ${
    s.tradesReturned === 1 ? 'trade' : 'trades'
  } out.${fresh}${tail}${open}${scope}${partial}${s.truncated ? ' Hit the page cap, so older history was not fetched.' : ''}${landed}`;
}

/** True when this sync gave the trader nothing, which is the row a support thread looks for. */
export function wasWasted(event: JournalEvent): boolean {
  return event.type === 'sync' && (event.sync?.tradesReturned ?? 0) === 0;
}
