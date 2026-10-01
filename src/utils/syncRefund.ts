/**
 * Whether a sync should cost the trader one of their daily syncs.
 *
 * Pure, in src/, and separate from the handler because this is the part with a judgement in it.
 * The plumbing around it — spend before the pull, hand back after — is checked by the compiler;
 * which outcomes deserve a refund is a decision, and it is the decision that was wrong.
 *
 * The allowance is spent before the pull and used to be handed back only for an upstream outage.
 * Everything else was charged, including the common case, which is not an exception at all: a
 * perfectly successful reply carrying zero trades. The handler already wrote "A sync was spent for
 * nothing" into the user's own history on each occurrence and then billed for it. Somebody
 * cancelled over this, having told us plainly it was happening.
 */

export type SyncOutcome =
  /** The broker answered and the matcher produced round trips. */
  | 'trades'
  /** The broker answered with no activity at all. */
  | 'empty-feed'
  /** Activity arrived, none of it paired into a round trip. */
  | 'nothing-matched'
  /** The broker or the aggregator was unreachable or 5xx. */
  | 'upstream-outage'
  /** The brokerage refused the stored credential and reconnecting is required. */
  | 'credential-rejected'
  /** The aggregator rate-limited us. */
  | 'rate-limited'
  /** We threw: a matcher bug, a malformed payload, anything of ours. */
  | 'our-fault'
  /** The caller sent something invalid — a bad account id, a malformed window. */
  | 'bad-request';

/**
 * True when the trader got nothing they can use, so the sync should not be charged.
 *
 * The rule is "did this produce trades", not "was it an error". Three of the refundable outcomes
 * below are successes by every HTTP measure and one of them — nothing-matched — is the single most
 * common thing that happens to an options trader whose closes have no opening fill in the window.
 *
 * `bad-request` is the one failure deliberately left charged, and not because it is clearly right:
 * it is the only thing standing between the daily cap and a client looping malformed requests. A
 * malformed account id is arguably our bug too. If that cap is ever enforced somewhere else, this
 * should become refundable.
 */
export function shouldRefundSync(outcome: SyncOutcome): boolean {
  switch (outcome) {
    case 'trades':
      return false;
    case 'bad-request':
      return false;
    case 'empty-feed':
    case 'nothing-matched':
    case 'upstream-outage':
    case 'credential-rejected':
    case 'rate-limited':
    case 'our-fault':
      return true;
  }
}

/**
 * What the sync badge should show after this attempt.
 *
 * Returned by the server rather than worked out in the browser, because the browser cannot know
 * whether a refund happened. Before this existed the meter counted down on every failure, so a run
 * of fruitless syncs drained the display while the account still had its allowance — the trader saw
 * themselves running out of something they had not spent.
 */
export function remainingAfterSync(remainingAfterSpend: number, refunded: boolean): number {
  return refunded ? remainingAfterSpend + 1 : remainingAfterSpend;
}

/**
 * What to tell the trader, when a sync cost them nothing.
 *
 * Said out loud rather than left to the meter. "Nothing came back" and "nothing came back, and it
 * did not cost you a sync" are different messages, and the gap between them is the complaint that
 * ended a subscription.
 */
export function refundNotice(outcome: SyncOutcome): string | null {
  if (!shouldRefundSync(outcome)) return null;

  return outcome === 'empty-feed' || outcome === 'nothing-matched'
    ? 'This did not use one of your syncs, because nothing came back.'
    : 'This did not use one of your syncs.';
}
