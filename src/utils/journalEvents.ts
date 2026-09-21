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

/** True when this sync gave the trader nothing, which is the row a support thread looks for. */
export function wasWasted(event: JournalEvent): boolean {
  return event.type === 'sync' && (event.sync?.tradesReturned ?? 0) === 0;
}
