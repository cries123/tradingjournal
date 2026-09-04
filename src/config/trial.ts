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
 * It is a complimentary grant with a date on it, which the entitlement system already
 * understands: effectiveTier honours it, the reaper spares it, and it ends on its own with
 * nothing scheduled to end it.
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
  | 'already-comped'
  | 'email-unverified'
  | 'email-already-used';

/** A record the trial rule can read. `trialStartedAt` is set once and never cleared. */
export interface TrialRecord extends AccessRecord {
  tier: Tier;
  trialStartedAt?: string | null;
}

export type TrialDecision =
  | { eligible: true; tier: Tier; days: number; until: string }
  | { eligible: false; reason: TrialRefusal; message: string };

export const REFUSALS: Record<TrialRefusal, string> = {
  'already-used': 'You have already had a free trial on this account.',
  'already-paid': 'Your plan already includes broker sync — there is nothing to trial.',
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

  // Anyone who is paying, or was granted a plan by hand, already has what the trial would give
  // them. A lapsed or cancelled subscriber is NOT excluded here — but they will have used their
  // trial before they ever subscribed, so the first rule catches them.
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

  return {
    eligible: true,
    tier: TRIAL_TIER,
    days: TRIAL_DAYS,
    until: new Date(now + TRIAL_DAYS * DAY_MS).toISOString(),
  };
}
