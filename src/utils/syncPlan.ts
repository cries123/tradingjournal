/**
 * How far back a sync has to ask the broker for — the part that knows about open positions.
 *
 * syncWindow.ts walks back from the newest trade the journal holds. That is the right anchor for
 * "what could be new", and the wrong one for matching: a round trip needs its OPENING fill, and a
 * position that was opened before the window and closed inside it has no open to pair with. For an
 * option the close was dropped; for a stock it was recorded as a short with an entry price the
 * trader never paid; and the gap note then blamed the broker for not sharing history it had never
 * been asked for.
 *
 * Worse, FIFO pairing depends on where the window starts. Scale into a position over longer than the
 * window, close part of it, and two syncs pair that one sale with two different buys — two sourceIds
 * for one fill, which dedupe cannot see as the same, each with its own P&L.
 *
 * So the matcher now reports what it left open, the server remembers the oldest of it per brokerage
 * account, and the next window starts no later than that. If the window begins at or before every
 * lot that was open when the last pull ended, the matcher's inventory at the window start is empty
 * in the data exactly as it was in reality — and pairing is the same as a full-history pull would
 * give, whatever the window.
 *
 * Pure, so the rule can be tested without Firestore or SnapTrade. The handler supplies the state and
 * stores the answer.
 */

export type FeedDirection = 'oldest-first' | 'newest-first';

export interface AccountSyncState {
  /**
   * Journal date of the oldest fill still open when the last pull ended, or null when nothing was.
   * The next window must start no later than this.
   */
  oldestOpenDate: string | null;
  /**
   * Whether oldestOpenDate can be trusted to be the oldest.
   *
   * True only when the pull that produced it saw every open lot: a full-history pull that did not
   * hit the page cap, or a window that began at or before the previous COMPLETE value. A windowed
   * pull from an unknown state might have missed an older open, and a value that might be wrong is
   * worth nothing here — the next sync pulls everything and repairs it.
   */
  complete: boolean;
  /**
   * Which way SnapTrade returns a feed, learned the first time a pull spans two dates.
   *
   * The matcher reads direction off the dates in the feed. A window holding a single day's fills
   * has no second date to read, so without this it would keep input order — and a newest-first feed
   * processed forward turns a day of long trades into invented shorts. The direction is a property
   * of the API, not of the day, so once seen it is remembered.
   */
  feedDirection?: FeedDirection;
  /** ISO, when this was written. The window never has to start later than the pull that wrote it. */
  updatedAt: string;
}

export type SyncStartReason =
  /** Nothing is known about this account yet: pull everything, and learn what is open. */
  | 'first-sync'
  /** The last pull could not vouch for its open positions: pull everything and repair. */
  | 'repairing'
  /** The caller's window, as asked. */
  | 'window'
  /** The caller's window, widened to reach a position that is still open. */
  | 'widened-for-open-position';

export interface SyncStartPlan {
  /** YYYY-MM-DD, or undefined to pull the account's whole history. */
  startDate: string | undefined;
  reason: SyncStartReason;
}

/** The day before a YYYY-MM-DD key. A margin for whether the broker's start date is inclusive. */
export function dayBefore(key: string): string {
  const at = Date.parse(`${key.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return key;
  return new Date(at - 86_400_000).toISOString().slice(0, 10);
}

/**
 * @param requested the window the caller would ask for on its own — syncStartDate's answer for a
 *   manual sync, lookbackStart's for the morning import. Undefined means "everything".
 */
export function planSyncStart(requested: string | undefined, state: AccountSyncState | null): SyncStartPlan {
  if (!state) return { startDate: undefined, reason: 'first-sync' };
  if (!state.complete) return { startDate: undefined, reason: 'repairing' };
  if (requested === undefined) return { startDate: undefined, reason: 'window' };
  if (state.oldestOpenDate === null) return { startDate: requested, reason: 'window' };

  const needed = dayBefore(state.oldestOpenDate);
  return needed < requested
    ? { startDate: needed, reason: 'widened-for-open-position' }
    : { startDate: requested, reason: 'window' };
}

/**
 * The state to store after a pull.
 *
 * `complete` is the whole decision. It holds when this pull saw every open lot — and it saw every
 * open lot when it pulled everything, or when its window began at or before every lot that was open
 * at the end of the previous pull (which the previous state has to have been able to vouch for) and
 * before that pull ran, so nothing opened in between was missed either. A pull that hit the page cap
 * is never complete: the oldest history, where the oldest opens are, is what it left out.
 */
export function nextSyncState(input: {
  previous: AccountSyncState | null;
  /** The window this pull actually used. */
  startDate: string | undefined;
  truncated: boolean;
  /** From the matcher: the oldest fill still open when the pull ended. */
  oldestOpenDate: string | null;
  /** From the matcher, when the feed spanned two dates. */
  observedDirection: FeedDirection | null;
  now: string;
}): AccountSyncState {
  const { previous, startDate, truncated } = input;

  let complete = !truncated;
  if (complete && startDate !== undefined) {
    const coversOpenLots =
      previous?.complete === true
      && (previous.oldestOpenDate === null || startDate <= dayBefore(previous.oldestOpenDate))
      && startDate <= previous.updatedAt.slice(0, 10);
    complete = coversOpenLots;
  }

  return {
    oldestOpenDate: input.oldestOpenDate,
    complete,
    ...((input.observedDirection ?? previous?.feedDirection)
      ? { feedDirection: input.observedDirection ?? previous?.feedDirection }
      : {}),
    updatedAt: input.now,
  };
}
