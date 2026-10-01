import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { needsEmptyError, shouldRefundStream } from './streamRefund';

/*
 * Who pays for a streamed answer that did not arrive.
 *
 * The expensive direction here is charging, and the reason is the client: streamAssistant treats any
 * error event as "start over on the buffered endpoint", and that endpoint spends a message of its
 * own. So an error event already costs the trader a second message — if the stream keeps the first
 * one too, one failure costs two of fifteen on Gold and shows nothing for either.
 */

describe('shouldRefundStream', () => {
  it('charges for an answer that arrived', () => {
    expect(shouldRefundStream({ tokensDelivered: true, errorSent: false })).toBe(false);
  });

  it('refunds a stream that opened cleanly and said nothing', () => {
    /*
     * The handler's own comment calls this "the reasoning-budget failure", so it is a known and
     * recurring outcome rather than a freak one — and it was charged in full while the client
     * silently retried and was charged again.
     */
    expect(shouldRefundStream({ tokensDelivered: false, errorSent: true })).toBe(true);
  });

  it('refunds a stream that broke part way through', () => {
    /*
     * Deliberately not "charge for a partial answer". The client discards partial text along with
     * the error and starts over, so the trader keeps nothing — and that retry is charged. Keeping
     * this charge too would be billing twice for one answer.
     */
    expect(shouldRefundStream({ tokensDelivered: true, errorSent: true })).toBe(true);
  });

  it('keeps the charge when nothing went wrong, even with nothing to show', () => {
    // Not reachable through the handler, which always reports an empty stream as an error — asserted
    // so that the rule is "did we tell the client to retry", not "were there tokens". If the handler
    // ever stops sending that event, the test above is the one that fails, not this one.
    expect(shouldRefundStream({ tokensDelivered: false, errorSent: false })).toBe(false);
  });
});

describe('the assumption the rule rests on', () => {
  it('still has the client retrying a failed stream on the endpoint that charges', () => {
    /*
     * The refund is only right because the client starts over on the buffered endpoint, which spends
     * a message of its own. If that ever changes — the client shows the error instead of retrying —
     * then refunding here hands out a free message rather than preventing a double charge, and this
     * file's reasoning stops being true.
     *
     * Asserted against the source because there is nothing else to assert it against: the behaviour
     * lives in a fetch-driven loop that a node test cannot drive. Same idiom as billingPromise.
     */
    const client = readFileSync('src/services/aiAssistant.ts', 'utf8');

    // An error event sets `failed`, and `failed` sends it to the buffered endpoint.
    expect(client).toMatch(/event === 'error'\)\s*failed = true/);
    expect(client).toMatch(/if \(failed \|\| !answer\.trim\(\)\) \{\s*return askAssistant\(/);
  });

  it('has the handler marking every error event it sends', () => {
    /*
     * The handler is a .mts file and vitest only collects src/**-/*.test.ts, so it cannot be driven
     * from here. This at least pins the two things that would silently undo the fix: an error event
     * emitted without setting errorSent, or the refund decision dropping out of the finally.
     *
     * Three events, three flags: the upstream failure refunds before it ever opens a stream, and
     * `empty` and `interrupted` both set errorSent for the check at the end.
     */
    const handler = readFileSync('netlify/functions/ai-assistant-stream.mts', 'utf8');

    const errorEvents = handler.match(/event: error/g) ?? [];
    const flagsSet = handler.match(/errorSent = true/g) ?? [];
    expect(errorEvents).toHaveLength(flagsSet.length);
    expect(flagsSet.length).toBeGreaterThanOrEqual(2);
    expect(handler).toMatch(/shouldRefundStream\(\{ tokensDelivered: produced, errorSent \}\)/);
  });
});

describe('needsEmptyError', () => {
  it('reports a stream that delivered nothing', () => {
    // Without the event the UI renders a blank reply as though the assistant had answered.
    expect(needsEmptyError({ tokensDelivered: false })).toBe(true);
  });

  it('stays quiet when tokens were delivered', () => {
    expect(needsEmptyError({ tokensDelivered: true })).toBe(false);
  });
});
