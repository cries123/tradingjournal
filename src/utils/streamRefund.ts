/**
 * Whether a streamed assistant answer should cost the trader one of their daily messages.
 *
 * Pure and in src/ for the same reason syncRefund.ts is: the plumbing around it — spend before the
 * model call, hand back after — is checked by the compiler, while which outcomes deserve a refund is
 * a judgement, and it is the judgement that was wrong.
 *
 * THE RULE COMES FROM WHAT THE CLIENT DOES, not from the HTTP status.
 *
 * streamAssistant treats any `error` event as "start over on the buffered endpoint", and that
 * endpoint spends a message of its own. So every error event already costs the trader a second
 * message whether the stream charged for the first one or not. The stream refunding its own spend is
 * what makes a failure cost one message instead of two.
 *
 * The upstream-failure path worked this out already — "without this refund a single upstream hiccup
 * silently costs the user two of their daily messages" — and then the two failures that happen
 * AFTER the stream opens were left charged:
 *
 *   - `empty`: the stream opened cleanly and delivered no tokens at all. The handler's own comment
 *     calls it "the reasoning-budget failure", so it is a known, recurring outcome. The trader saw
 *     nothing and paid twice.
 *   - `interrupted`: the stream broke part way. Partial text is discarded by the client along with
 *     everything else, so it is not something the trader got to keep.
 *
 * On Gold that is 15 messages a day. Two bad streams took four of them and showed nothing for two.
 */

export interface StreamOutcome {
  /** At least one token reached the client. */
  tokensDelivered: boolean;
  /** An `error` event was sent, which is what makes the client discard and retry elsewhere. */
  errorSent: boolean;
}

/**
 * True when the spend should be handed back.
 *
 * Deliberately NOT "tokensDelivered === false". A partial answer followed by an interruption is
 * charged by the retry regardless, and the trader cannot use what they were shown — the client
 * throws it away. Keeping the charge in that case would be charging twice for one answer, which is
 * the thing this exists to stop.
 */
export function shouldRefundStream(outcome: StreamOutcome): boolean {
  return outcome.errorSent;
}

/** A stream that ended with no tokens has to say so, or the client renders a blank reply. */
export function needsEmptyError(outcome: Pick<StreamOutcome, 'tokensDelivered'>): boolean {
  return !outcome.tokensDelivered;
}
