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
  /** True when the pull hit its page cap, so older history was not fetched. */
  truncated: boolean;
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
  // An automatic run spends nothing, so "spent for nothing" is only true of the Sync button.
  const wasted = s.automatic ? '' : ' A sync was spent for nothing.';
  const open = s.openPositions ? ` ${s.openPositions} ${s.openPositions === 1 ? 'position is' : 'positions are'} still open.` : '';
  const scope =
    s.windowReason === 'first-sync' || s.windowReason === 'repairing'
      ? ' Read the full history.'
      : s.windowReason === 'widened-for-open-position'
        ? ' Reached back to an open position.'
        : '';

  if (s.activityCount === 0) {
    return `${verb} — the broker returned no activity at all.${open}${scope}${wasted}`;
  }

  if (s.tradesReturned === 0) {
    const why =
      s.unmatchedCloses > 0
        ? ` ${s.unmatchedCloses} ${s.unmatchedCloses === 1 ? 'close had' : 'closes had'} no opening fill to pair with.`
        : s.ignored > 0
          ? ` All ${s.ignored} were ${describeIgnored(s.ignoredByType)} the matcher could not use.`
          : '';
    return `${verb} — ${s.activityCount} activities came back but nothing paired into a trade.${why}${open}${scope}${wasted}`;
  }

  const lost = s.activityCount - s.tradesReturned * 2;
  const tail =
    s.unmatchedCloses > 0
      ? ` ${s.unmatchedCloses} ${s.unmatchedCloses === 1 ? 'close' : 'closes'} had no opening fill.`
      : lost > 0 && s.ignored > 0
        ? ` ${s.ignored} activities were unusable.`
        : '';

  const fresh = s.fresh != null ? ` ${s.fresh} new.` : '';
  return `${verb} — ${s.activityCount} activities in, ${s.tradesReturned} ${
    s.tradesReturned === 1 ? 'trade' : 'trades'
  } out.${fresh}${tail}${open}${scope}${s.truncated ? ' Hit the page cap, so older history was not fetched.' : ''}`;
}

/** True when this sync gave the trader nothing, which is the row a support thread looks for. */
export function wasWasted(event: JournalEvent): boolean {
  return event.type === 'sync' && (event.sync?.tradesReturned ?? 0) === 0;
}
