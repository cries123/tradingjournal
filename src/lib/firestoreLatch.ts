/**
 * Noticing that this tab's Firestore client has stopped for good.
 *
 * After an internal assertion the SDK's work queue latches: every later read and write throws the
 * same assertion and every listener goes quiet. The journal then keeps showing its last snapshot
 * as though it were current and saves nothing, with no message, because the failure arrives as an
 * unhandled rejection from inside the SDK rather than through the trades listener's error callback.
 *
 * The global error listeners pass every failure through here; the journal subscribes and puts up
 * the reload banner. Kept free of any Firestore import, because the error listeners are installed
 * from the landing page's entry, which must not pull Firestore in (src/lib/entryWeight.test.ts).
 */

type Listener = (error: unknown) => void;

const listeners = new Set<Listener>();
let latched: unknown = null;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

/** True for the SDK's own "this client is finished" failure, whatever the assertion ID. */
export function isFirestoreLatchError(error: unknown): boolean {
  const message = messageOf(error);
  return message.includes('FIRESTORE') && message.includes('INTERNAL ASSERTION FAILED');
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

/** Test seam. Not used by the app: a latched client stays latched until the page reloads. */
export function __resetFirestoreLatchForTests(): void {
  latched = null;
  listeners.clear();
}
