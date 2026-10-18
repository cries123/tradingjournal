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

/**
 * An opening fill as the broker sent it, sized to what is still open. Built and read by the matcher
 * (server/mapSnapTradeActivities.ts); this side only stores it. Opaque on purpose, so nothing under
 * src/ depends on the server's activity shape — the handler casts it back on the way in.
 */
export type CarriedOpenFill = object;

/**
 * The most open lots a resume point carries.
 *
 * Each is one broker row, a few hundred bytes, and the sync-state document holds every account's
 * state inside Firestore's one-megabyte document limit. Past this the state falls back to widening
 * the next window to the oldest open position — correct, and possibly unable to make progress — on
 * the view that five hundred open lots AND a history too long for one pull is not worth a second
 * document.
 */
export const MAX_CARRIED_OPEN_LOTS = 500;

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
  /**
   * The first day the last pull did not read, when it stopped before the end of its window.
   *
   * A pull has a wall-clock budget (see server/activityPull.ts). When it runs out, everything up to
   * but not including this UTC day has been matched and handed over, and this day onward has not
   * been looked at. The next window starts here — or earlier, for a position still open — rather
   * than at the beginning of the history again, which is what turned a large first sync into a
   * request that could never finish. Absent once a pull reaches the end of its window.
   */
  resumeFrom?: string;
  /**
   * The lots open at `resumeFrom`, for the next pull to start from.
   *
   * Without these, the next window had to reach back to the oldest open position so its close
   * could find its open — and a position held since before the cut sent every resumed pull back
   * over the same pages to the same cut, forever. Seeded into the matcher, they put it in the state
   * the last pull finished in, and the window starts exactly at the cut. Only stored with a resume
   * point, and only up to MAX_CARRIED_OPEN_LOTS of them.
   */
  openLots?: CarriedOpenFill[];
  /**
   * Rows the window still held from `resumeFrom` on, by the broker's count less what was matched.
   * A newest-first feed is paged from its far end, and this is what lets the next pull start there
   * without first reading a front page it cannot use. Only stored with a resume point.
   */
  remainingRows?: number;
  /** ISO, when this was written. The window never has to start later than the pull that wrote it. */
  updatedAt: string;
}

export type SyncStartReason =
  /** Nothing is known about this account yet: pull everything, and learn what is open. */
  | 'first-sync'
  /** The last pull could not vouch for its open positions: pull everything and repair. */
  | 'repairing'
  /** The last pull ran out of time; carrying on from the first day it did not read. */
  | 'resuming'
  /** The caller's window, as asked. */
  | 'window'
  /** The caller's window, widened to reach a position that is still open. */
  | 'widened-for-open-position';

export interface SyncStartPlan {
  /** YYYY-MM-DD, or undefined to pull the account's whole history. */
  startDate: string | undefined;
  reason: SyncStartReason;
  /** The inventory at startDate, to seed the matcher with: a resumed pull's carried lots. */
  openLots?: CarriedOpenFill[];
  /** How many rows the window is expected to hold, when the last pull counted them. */
  expectedRows?: number;
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

  /*
   * The caller's window is ignored while a pull is unfinished, in both directions.
   *
   * It cannot start later: everything from resumeFrom on is unread, whatever the journal's newest
   * trade says. And it need not start earlier: the history before resumeFrom was read minutes or
   * days ago, so re-asking for a fortnight of it would spend the same budget that ran out last time
   * on pages that import nothing. The lots open at the cut travel with the state, so the window
   * starts exactly there; only a state too large to carry them falls back to reaching for the
   * oldest open position, for the reason given at the top of this file.
   */
  if (state.resumeFrom !== undefined) {
    if (state.openLots !== undefined) {
      return {
        startDate: state.resumeFrom,
        reason: 'resuming',
        openLots: state.openLots,
        ...(state.remainingRows !== undefined ? { expectedRows: state.remainingRows } : {}),
      };
    }
    const forOpen = state.oldestOpenDate === null ? null : dayBefore(state.oldestOpenDate);
    const startDate = forOpen !== null && forOpen < state.resumeFrom ? forOpen : state.resumeFrom;
    return { startDate, reason: 'resuming' };
  }

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
 * before that pull ran, so nothing opened in between was missed either.
 *
 * A pull that stopped early is still complete, as far as it went: it reads the window from the
 * oldest end and hands over only whole days, so the lots it reports open are exactly the lots open
 * at `resumeFrom`. What it must not be followed by is a window that starts AFTER that point — the
 * days in between would never be read — so a previous resume point is one more date the next
 * window has to reach. A pull that started exactly there, seeded with the carried lots, has the
 * previous open lots in hand without having read them, which is the one case the window may begin
 * after an open position.
 */
export function nextSyncState(input: {
  previous: AccountSyncState | null;
  /** The window this pull actually used. */
  startDate: string | undefined;
  /** The first day this pull did not read, when it stopped early; undefined when it reached the end. */
  resumeFrom: string | undefined;
  /** From the matcher: the oldest fill still open when the pull ended. */
  oldestOpenDate: string | null;
  /** From the matcher: the lots still open when the pull ended, as rows to seed the next one with. */
  openLots: CarriedOpenFill[];
  /** The broker's count of the window's rows less the rows this pull matched, when it counted them. */
  remainingRows?: number;
  /** From the matcher, when the feed spanned two dates. */
  observedDirection: FeedDirection | null;
  now: string;
}): AccountSyncState {
  const { previous, startDate } = input;

  let complete = true;
  if (startDate !== undefined) {
    const seededAtTheCut =
      previous?.resumeFrom !== undefined && previous.openLots !== undefined && startDate === previous.resumeFrom;
    const coversOpenLots =
      previous?.complete === true
      && (seededAtTheCut || previous.oldestOpenDate === null || startDate <= dayBefore(previous.oldestOpenDate))
      && (previous.resumeFrom === undefined || startDate <= previous.resumeFrom)
      && startDate <= previous.updatedAt.slice(0, 10);
    complete = coversOpenLots;
  }

  const carry = input.resumeFrom !== undefined && input.openLots.length <= MAX_CARRIED_OPEN_LOTS;

  return {
    oldestOpenDate: input.oldestOpenDate,
    complete,
    ...((input.observedDirection ?? previous?.feedDirection)
      ? { feedDirection: input.observedDirection ?? previous?.feedDirection }
      : {}),
    ...(input.resumeFrom !== undefined ? { resumeFrom: input.resumeFrom } : {}),
    ...(carry ? { openLots: input.openLots } : {}),
    ...(carry && input.remainingRows !== undefined && input.remainingRows >= 0 ? { remainingRows: input.remainingRows } : {}),
    updatedAt: input.now,
  };
}
