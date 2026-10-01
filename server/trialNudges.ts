import { TRIAL_DAYS } from '../src/config/trial';
import { DAY_MS } from '../src/config/accessExtension';
import { trialUntil, type Entitlement } from './entitlements';

/**
 * The three moments in a trial worth writing to somebody about.
 *
 * A trial nobody is reminded of converts badly, and this one converts by charging a card: it
 * starts, a week passes, and the first thing the person hears from us is a $9 line on their
 * statement. Each of these has a job — get them to connect, say when the charge lands, say it
 * again on the day — and the last two are the ones that stop a chargeback.
 *
 * This used to read the trial off `comp.trial`, which only a second, self-serve trial endpoint ever
 * wrote and nothing ever called. So the whole sequence had never sent an email to anybody. The
 * trial that actually runs is Creem's, and the entitlement now carries its dates.
 *
 * The decision is pure and lives here so the boundaries are testable without a clock, a mailbox
 * or a Firestore.
 */
export type NudgeStage = 'started' | 'ending' | 'last-day';

/** Days remaining when the "two days left" note goes out. */
export const ENDING_SOON_DAYS = 2;

export interface TrialState {
  startedAt: string;
  endsAt: string;
  /**
   * Whether the card is charged when the trial ends.
   *
   * False once they have cancelled: Creem keeps them on the plan to the end of the trial and then
   * takes nothing, so the two notes that exist to warn about a charge must not claim one. The same
   * email with this wrong in either direction is the worst thing in this file — "you will be
   * charged" to somebody who cancelled reads as us ignoring the cancellation, and silence to
   * somebody who did not is the surprise charge itself.
   */
  willCharge: boolean;
}

export interface NudgeInput {
  entitlement: Entitlement | null;
  /** Stages already sent for THIS trial, by the date the trial ends. */
  sent?: Record<string, string> | null;
  /**
   * Whether they have used the unsubscribe link in the welcome note.
   *
   * It suppresses that note only. The other two say when a card is charged and how to stop it,
   * which is the same reason the broker-link notices carry no unsubscribe either: nobody is served
   * by being able to opt out of a warning and then be surprised by what it warned about.
   */
  optedOut?: boolean;
  now: number;
}

export type NudgeDecision =
  | { send: false }
  | { send: true; stage: NudgeStage; endsAt: string; daysLeft: number; willCharge: boolean };

/** The Creem trial running on this record right now, or null. */
export function liveTrial(e: Entitlement | null, now: number): TrialState | null {
  const endsAt = trialUntil(e, now);
  // Both dates, because the start is what the welcome's "a day in" boundary is measured from. The
  // webhook writes them together, so one without the other is a half-written record.
  if (!endsAt || !e?.trialStartedAt) return null;

  return {
    startedAt: e.trialStartedAt,
    endsAt,
    // 'active' is the state a trial sits in — creemClient maps subscription.trialing to it, because
    // a triallist has handed over a card and should pass every gate a subscriber passes. Anything
    // else here means they have already cancelled or the subscription has gone wrong.
    willCharge: e.status === 'active',
  };
}

/** Whole days remaining, rounded up: an hour left is still "1 day", never "0". */
export function daysRemaining(endsAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now) / DAY_MS));
}

/**
 * Which note, if any, this account is due.
 *
 * At most one per run, newest stage first, and each is keyed by the trial's own end date — so a
 * second trial (an admin extending one, say) is a different key and gets its own notes rather
 * than being silently skipped because the first one was already written to.
 */
export function decideNudge(input: NudgeInput): NudgeDecision {
  const trial = liveTrial(input.entitlement, input.now);
  if (!trial) return { send: false };

  const daysLeft = daysRemaining(trial.endsAt, input.now);
  const startedAt = Date.parse(trial.startedAt);
  const sent = input.sent ?? {};
  const key = (stage: NudgeStage) => `${stage}:${trial.endsAt}`;

  const due = (stage: NudgeStage): NudgeDecision =>
    sent[key(stage)]
      ? { send: false }
      : { send: true, stage, endsAt: trial.endsAt, daysLeft, willCharge: trial.willCharge };

  // Last day first: a trial that reaches its final morning should hear that, not a note about
  // getting started because the first one happened to fail earlier in the week.
  if (daysLeft <= 1) return due('last-day');
  if (daysLeft <= ENDING_SOON_DAYS) return due('ending');

  // The welcome goes out on the run after it starts rather than the instant it does — the app
  // has already told them on screen, and a second copy of that in the inbox is noise.
  if (Number.isFinite(startedAt) && input.now - startedAt >= DAY_MS && daysLeft < TRIAL_DAYS) {
    return input.optedOut ? { send: false } : due('started');
  }

  return { send: false };
}

/** The key a sent note is recorded under. Exported so the caller cannot invent its own shape. */
export function nudgeKey(stage: NudgeStage, endsAt: string): string {
  return `${stage}:${endsAt}`;
}
