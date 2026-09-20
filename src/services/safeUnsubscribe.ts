import type { Unsubscribe } from 'firebase/firestore';
import { reportErrorSilently } from './errorReporting';

/**
 * A Firestore unsubscribe that cannot take the app down with it.
 *
 * Every listener in this app is torn down by React, as an effect cleanup — usually `return unsub`.
 * React runs cleanups during commit, so a cleanup that THROWS is not a caught error anywhere: it
 * propagates out of the commit phase and the ErrorBoundary paints the crash screen over a journal
 * that was working a moment earlier.
 *
 * Which is what happened. Firestore 12.15.0 raised
 *
 *   INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)
 *   CONTEXT: TypeError: e.tc.get is not a function or its return value is not iterable
 *
 * from inside its own IndexedDB layer, and the throw surfaced on the way out of a support-ticket
 * listener's unsubscribe — E (supportTickets) ← JournalApp ← Uc (React). The same assertion also
 * arrives twice more from places this app cannot reach at all: the SDK's own `visibilitychange`
 * handler and its internal async queue. Those two are the SDK's to fix and are only reported.
 *
 * This is the third one, and it is ours: detaching a listener is bookkeeping on the way out of a
 * screen. Whatever it says, nobody is served by turning it into a crash. The failure is still
 * reported with a scope so the row in the error feed names the listener rather than arriving as
 * another anonymous SDK stack.
 */
export function safeUnsubscribe(unsub: Unsubscribe, scope: string): Unsubscribe {
  return () => {
    try {
      unsub();
    } catch (err) {
      reportErrorSilently(err, 'promise', scope);
    }
  };
}
