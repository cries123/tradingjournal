/**
 * Noticing that this tab's Firestore client has stopped for good, and recovering when nobody is
 * looking.
 *
 * After an internal assertion the SDK's work queue latches: every later read and write throws the
 * same assertion and every listener goes quiet. The journal then keeps showing its last snapshot
 * as though it were current and saves nothing, with no message, because the failure arrives as an
 * unhandled rejection from inside the SDK rather than through the trades listener's error callback.
 *
 * The global error listeners pass every failure through here; the journal subscribes and puts up
 * the reload banner. Kept free of any Firestore import, because the error listeners are installed
 * from the landing page's entry, which must not pull Firestore in (src/lib/entryWeight.test.ts).
 *
 * The latch is almost always Safari's doing — it ends the on-disk cache's transaction when the app
 * is backgrounded or the phone locks — so it almost always fires while nobody is looking. A reload
 * then costs nothing (pending writes are on disk and are re-sent on load, and nothing is being
 * typed) and the person comes back to a working journal with no banner at all. A reload under
 * somebody's thumb would lose what they were typing, so while the page is visible the banner stays
 * and the reload waits for the next time the app is put away.
 */

type Listener = (error: unknown) => void;

const listeners = new Set<Listener>();
let latched: unknown = null;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

/**
 * True for a failure that means this client is finished: the SDK's own assertion, whatever its
 * ID, and the two shapes Safari's dropped IndexedDB transaction arrives in — the SDK's wrapper and
 * WebKit's raw wording, which reaches the error feed as an UnknownError.
 */
export function isFirestoreLatchError(error: unknown): boolean {
  const message = messageOf(error);
  if (message.includes('FIRESTORE') && message.includes('INTERNAL ASSERTION FAILED')) return true;
  if (nameOf(error) === 'IndexedDbTransactionError') return true;
  return message.includes('without an in-progress transaction');
}

/** Called with every uncaught failure. Records the first latch and tells the journal once. */
export function noteFirestoreFailure(error: unknown): void {
  if (latched !== null || !isFirestoreLatchError(error)) return;
  latched = error;
  for (const listener of listeners) listener(error);
}

/**
 * Hears about a latch. A subscriber that arrives after it already happened is told at once, so a
 * journal that mounts late still shows the banner.
 */
export function subscribeFirestoreLatch(listener: Listener): () => void {
  if (latched !== null) listener(latched);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------------ recovery */

/**
 * How often the page may reload itself. A genuinely broken build that latched on every load
 * would otherwise reload forever, invisibly, eating the phone's battery and the read quota. Ten
 * minutes is long enough that a loop is one reload per visit rather than a storm, and short enough
 * that a second genuine latch in a session still recovers.
 */
export const RELOAD_GUARD_MS = 10 * 60 * 1000;
const RELOAD_AT_KEY = 'tc-latch-reload-at';

/** Pure: whether a latched page should reload now. Reload only unseen, and not twice in a row. */
export function shouldReloadNow(
  visibility: DocumentVisibilityState,
  lastReloadAt: number | null,
  now: number,
): boolean {
  if (visibility !== 'hidden') return false;
  return lastReloadAt === null || now - lastReloadAt >= RELOAD_GUARD_MS;
}

function readLastReload(): number | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_AT_KEY);
    const at = raw === null ? NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function recordReload(now: number): void {
  try {
    sessionStorage.setItem(RELOAD_AT_KEY, String(now));
  } catch {
    // Private browsing — the reload still happens, it is just not counted.
  }
}

/**
 * Reloads a latched page the moment it is out of sight.
 *
 * Installed once, with the error listeners. `onReload` is told first so the reload can be
 * recorded in the error feed under its own scope, which is how the admin sees how often this
 * fires — a count that doubles as the measure of whether the cache change for WebKit worked.
 */
export function installFirestoreRecovery(onReload: () => void = () => undefined): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const attempt = () => {
    if (latched === null) return;
    const now = Date.now();
    if (!shouldReloadNow(document.visibilityState, readLastReload(), now)) return;
    recordReload(now);
    onReload();
    window.location.reload();
  };

  subscribeFirestoreLatch(attempt);
  document.addEventListener('visibilitychange', attempt);
}

/** Test seam. Not used by the app: a latched client stays latched until the page reloads. */
export function __resetFirestoreLatchForTests(): void {
  latched = null;
  listeners.clear();
}
