import type { SyncStartReason } from './syncPlan';
import { historyLoadingLine, noNewTradesLine } from './brokerHistoryStatus';

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
  /** The brokerage, for the sentences that are about the broker rather than the account. */
  institution?: string | null;
  /** Rows the broker returned, before matching. */
  activityCount: number;
  /** Round trips the server built from them. */
  tradesReturned: number;
  /** Of those, the ones the journal did not already have. */
  fresh: number;
  truncated: boolean;
  /** The server's own words for a refunded sync, or null when it was earned. */
  refundNotice: string | null;
  /** Why the server asked for the window it did. */
  windowReason?: SyncStartReason;
  /** The first day the server asked for, or null when it asked for everything. */
  windowStart?: string | null;
}

/**
 * True when the pull asked for the account's whole history.
 *
 * windowStart is null for every full pull whatever the reason; the two reasons cover an answer
 * from a server that did not send windowStart.
 */
export function fullHistoryPull(r: Pick<SyncResult, 'windowReason' | 'windowStart'>): boolean {
  return r.windowStart === null || r.windowReason === 'first-sync' || r.windowReason === 'repairing';
}

/**
 * True when nothing came back from a pull that asked for everything: the history is still on its
 * way from the broker, not absent.
 *
 * Not keyed on the account's `initial_sync_completed` flag, which the Sync button checks before
 * pulling. The connection that prompted this answered empty at six and fourteen minutes and had
 * 880 activities three days later; whether the flag was already true then is not known, and an
 * empty full pull means the same thing either way. The screen puts this answer in the wait box.
 */
export function historyStillOnItsWay(r: Pick<SyncResult, 'activityCount' | 'windowReason' | 'windowStart'>): boolean {
  return r.activityCount === 0 && fullHistoryPull(r);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function describeSyncResult(r: SyncResult): string {
  let line: string;

  if (r.activityCount === 0) {
    /*
     * Never "no activity". Jay: "instead of saying no activity we need to say broker is still
     * sending snaptrade your trade history please wait and try again in 30 minutes … because people
     * dont think it works and they are canceling." An empty full pull is that. An empty narrow
     * window on an account that has imported before is the other normal case — nothing new, and
     * SnapTrade delivers a day late anyway — and is told apart so a trader checking today's fills
     * is not told to wait for a history they already have.
     */
    const broker = r.institution || r.label;
    line = fullHistoryPull(r) ? historyLoadingLine(broker) : noNewTradesLine(broker);
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

  // Why it took as long as it did, when it did. Not after an empty feed: "read your full history"
  // next to "still sending your trade history" would contradict it.
  if (r.activityCount === 0) {
    // nothing to add
  } else if (r.windowReason === 'first-sync' || r.windowReason === 'repairing') {
    line += ' This sync read your full history.';
  } else if (r.windowReason === 'widened-for-open-position') {
    line += ' It reached back to a position you still hold.';
  }

  if (r.refundNotice) line += ` ${r.refundNotice}`;

  return line;
}
