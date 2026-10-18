import type { SyncStartReason } from './syncPlan';

/**
 * The one sentence a sync ends with, for every way a sync can end.
 *
 * The connect screen used to say "No trade activity found" whenever nothing new arrived — and said
 * it before the gap notes were set, so the one outcome that needed explaining ("47 activities came
 * back, none of them paired") got neither the count nor the reason. The server had worked both out.
 * It also returned, and the screen never read, the line saying the sync had been refunded. The
 * sentence lives here, pure, so every path on the screen has to go through it.
 */
export interface SyncResult {
  /** The account's name, or its institution. */
  label: string;
  /** Rows the broker returned, before matching. */
  activityCount: number;
  /** Round trips the server built from them. */
  tradesReturned: number;
  /** Of those, the ones the journal did not already have. */
  fresh: number;
  /** An older server's page cap. No longer sent; kept so a cached bundle's answer still reads. */
  truncated?: boolean;
  /**
   * The pull ran out of time and handed over the history up to a day; the rest is unread.
   *
   * The sentence for it is fixed by what the trader has to DO — press Sync again — because the
   * first version of this failure was a 504 page and a journal that stayed empty, with no instruction
   * at all.
   */
  partial?: boolean;
  /** The server's own words for a refunded sync, or null when it was earned. */
  refundNotice: string | null;
  /** Why the server asked for the window it did. */
  windowReason?: SyncStartReason;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export const PARTIAL_SYNC_LINE = 'Imported part of your history — sync again to continue.';

export function describeSyncResult(r: SyncResult): string {
  let line: string;

  if (r.partial) {
    const skipped = r.tradesReturned - r.fresh;
    const counts =
      r.tradesReturned === 0
        ? 'Nothing in this part paired into a round trip yet.'
        : r.fresh === 0
          ? `All ${plural(r.tradesReturned, 'trade')} in this part from ${r.label} ${r.tradesReturned === 1 ? 'was' : 'were'} already imported.`
          : `${plural(r.fresh, 'trade')} from ${r.label} so far${skipped > 0 ? ` (${skipped.toLocaleString()} already up to date)` : ''}.`;
    line = `${PARTIAL_SYNC_LINE} ${counts}`;
  } else if (r.activityCount === 0) {
    line = `No trade activity came back from ${r.label}.`;
  } else if (r.tradesReturned === 0) {
    // The count is the clue: it tells the trader the connection works and the feed is not empty,
    // and that the explanation is in the notes underneath rather than in their broker settings.
    line = `${plural(r.activityCount, 'activity row')} came back from ${r.label}, but none paired into a round trip — see below.`;
  } else if (r.fresh === 0) {
    line = `You’re up to date — all ${plural(r.tradesReturned, 'trade')} from ${r.label} ${r.tradesReturned === 1 ? 'was' : 'were'} already imported.`;
  } else {
    const skipped = r.tradesReturned - r.fresh;
    line = `Imported ${plural(r.fresh, 'trade')} from ${r.label}${skipped > 0 ? ` (${skipped.toLocaleString()} already up to date).` : '.'}`;
  }

  if (r.truncated) {
    line += ' This account has more activity than one sync can pull in — the oldest history was left out.';
  }

  // Why it took as long as it did, when it did. A cut-short pull did not read the full history,
  // whatever it set out to read, so that claim is only made once the pull got to the end.
  if ((r.windowReason === 'first-sync' || r.windowReason === 'repairing') && !r.partial) {
    line += ' This sync read your full history.';
  } else if (r.windowReason === 'resuming') {
    line += ' It carried on from where the last sync stopped.';
  } else if (r.windowReason === 'widened-for-open-position') {
    line += ' It reached back to a position you still hold.';
  }

  if (r.refundNotice) line += ` ${r.refundNotice}`;

  return line;
}
