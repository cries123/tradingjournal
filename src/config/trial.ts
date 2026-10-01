import { compIsLive, DAY_MS, type AccessRecord } from './accessExtension';
import { TIER_PLANS, type Tier } from './tiers';

/**
 * The free trial.
 *
 * Broker sync is the only thing this product charges for, and until now no free account could
 * touch it — so the one feature worth paying for was the one nobody could ever experience. The
 * funnel shows exactly that: plenty of signups, almost no connections. A trial is the shortest
 * path from "sounds useful" to "my calendar filled itself in".
 *
 * The trial itself belongs to CREEM, attached to the Silver product, so it is redeemed by going
 * through checkout: the card is taken up front and the person becomes a real subscriber straight
 * away. ACCESS needs no special case for that — the reaper and effectiveTier should see an ordinary
 * subscription, because a triallist has handed over a card and is entitled to what they are
 * trialling.
 *
 * Everything else does. "No special case anywhere" was taken literally for a year: the webhook
 * flattened `trialing` into `active` and kept no trace, so nothing could tell a trial from a paid
 * month. The three trial emails never sent, the "one trial per brokerage" guard never fired, the
 * admin run rate counted money nobody had paid, and every screen said "renews" about a first
 * charge. The entitlement now carries trialStartedAt and trialEndsAt, and everything that needs to
 * know reads them through trialUntil() — deliberately outside the access decision, so a stale date
 * can never become free access to the one feature this product charges for.
 *
 * TRIAL_DAYS therefore has to MATCH the Creem product's own trial setting. It is the number the
 * site promises, and Creem is the one that honours it; if the two disagree the site is lying, and
 * nothing in this codebase can detect that. Change one, change the other.
 */

export const TRIAL_TIER: Tier = 'silver';
export const TRIAL_DAYS = 7;

/** What the button says, and what the plan card promises. */
export function trialOffer(): string {
  return `${TRIAL_DAYS}-day free ${TIER_PLANS[TRIAL_TIER].name} trial`;
}

export type TrialRefusal =
  | 'already-used'
  | 'already-paid'
  | 'subscribed-before'
  | 'already-comped'
  | 'email-unverified'
  | 'email-already-used';

/** A record the trial rule can read. `trialStartedAt` is set once and never cleared. */
export interface TrialRecord extends AccessRecord {
  tier: Tier;
  trialStartedAt?: string | null;
  /**
   * Set once Creem has ever opened a subscription for this account, and never cleared by a
   * cancellation. It is the only durable trace that this account has been a customer, which is what
   * the lapsed-subscriber rule below needs — `tier` and `status` both decay back towards a record
   * that looks like a fresh free account.
   */
  creemSubscriptionId?: string;
}

export type TrialDecision =
  | { eligible: true; tier: Tier; days: number; until: string }
  | { eligible: false; reason: TrialRefusal; message: string };

export const REFUSALS: Record<TrialRefusal, string> = {
  'already-used': 'You have already had a free trial on this account.',
  'already-paid': 'Your plan already includes broker sync — there is nothing to trial.',
  'subscribed-before':
    'Free trials are for accounts that have never subscribed. Pick a plan, or update your card if a payment failed.',
  'already-comped': 'You already have complimentary access, so a trial would give you nothing.',
  'email-unverified': 'Confirm your email address first — we have sent you a link.',
  'email-already-used': 'This email address has already been used for a free trial.',
};

/**
 * Whether this account may start a trial, decided from the entitlement alone.
 *
 * The same function runs on the server, where it is the rule, and on the client, where it only
 * decides whether to show the button. A client that lies about it gets refused by the server
 * running this exact code.
 */
export function refuse(reason: TrialRefusal): Extract<TrialDecision, { eligible: false }> {
  return { eligible: false, reason, message: REFUSALS[reason] };
}

export function decideTrial(record: TrialRecord | null, now: number): TrialDecision {
  // One per account, forever. Checked first so the answer stays the same after the trial has run
  // out and the record looks, from every other angle, like a fresh free account again.
  if (record?.trialStartedAt) {
    return refuse('already-used');
  }

  if (record && compIsLive(record.comp, now)) {
    return refuse('already-comped');
  }

  // Anyone who is paying, or was granted a plan by hand, already has what the trial would give them.
  if (record && record.tier !== 'free') {
    const paid = record.source === 'admin' || record.status === 'active';
    const withinPaidPeriod =
      record.status === 'canceled' &&
      Boolean(record.currentPeriodEnd) &&
      Date.parse(record.currentPeriodEnd as string) > now;
    if (paid || withinPaidPeriod) {
      return refuse('already-paid');
    }
  }

  /*
   * And anyone who has ever been a subscriber.
   *
   * This used to be waved off with "they will have used their trial before they subscribed, so the
   * first rule catches them" — which is not true of this product. The live trial belongs to Creem
   * and goes through checkout, so it never sets trialStartedAt; the first rule has never fired for
   * anybody. Meanwhile a failed payment leaves tier set but status past_due, which the rule above
   * does not catch either.
   *
   * The result was a customer whose card had just been declined being offered a free trial on the
   * pricing page, beside a banner asking them to update that card. Taking it would have opened a
   * second subscription rather than fixing the first.
   *
   * creemSubscriptionId is the durable trace: a cancellation does not clear it, so "has been a
   * customer" survives everything that decays tier and status back towards a free account.
   */
  if (record?.creemSubscriptionId) {
    return refuse('subscribed-before');
  }

  return {
    eligible: true,
    tier: TRIAL_TIER,
    days: TRIAL_DAYS,
    until: new Date(now + TRIAL_DAYS * DAY_MS).toISOString(),
  };
}
