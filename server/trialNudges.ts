import { TRIAL_DAYS } from '../src/config/trial';
import { compIsLive, DAY_MS, type ComplimentaryAccess } from '../src/config/accessExtension';
import type { Entitlement } from './entitlements';

/**
 * The three moments in a trial worth writing to somebody about.
 *
 * A trial nobody is reminded of converts badly: it starts, a week passes, it ends, and the first
 * they hear is that their broker link is going. Each of these has a job — get them to connect,
 * show them what it did, and say when it stops.
 *
 * The decision is pure and lives here so the boundaries are testable without a clock, a mailbox
 * or a Firestore.
 */
export type NudgeStage = 'started' | 'ending' | 'last-day';

/** Days remaining when the "two days left" note goes out. */
export const ENDING_SOON_DAYS = 2;

export interface NudgeInput {
  entitlement: Entitlement | null;
  /** Stages already sent for THIS trial, by the date the trial ends. */
  sent?: Record<string, string> | null;
  now: number;
}

export type NudgeDecision =
  | { send: false }
  | { send: true; stage: NudgeStage; endsAt: string; daysLeft: number };

/** The live trial on a record, or null if what is running is a gift rather than a trial. */
export function liveTrial(e: Entitlement | null, now: number): ComplimentaryAccess | null {
  if (!e || !compIsLive(e.comp, now)) return null;
  return e.comp.trial === true ? e.comp : null;
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

  const daysLeft = daysRemaining(trial.until, input.now);
  const startedAt = Date.parse(trial.grantedAt);
  const sent = input.sent ?? {};
  const key = (stage: NudgeStage) => `${stage}:${trial.until}`;

  const due = (stage: NudgeStage): NudgeDecision =>
    sent[key(stage)]
      ? { send: false }
      : { send: true, stage, endsAt: trial.until, daysLeft };

  // Last day first: a trial that reaches its final morning should hear that, not a note about
  // getting started because the first one happened to fail earlier in the week.
  if (daysLeft <= 1) return due('last-day');
  if (daysLeft <= ENDING_SOON_DAYS) return due('ending');

  // The welcome goes out on the run after it starts rather than the instant it does — the app
  // has already told them on screen, and a second copy of that in the inbox is noise.
  if (Number.isFinite(startedAt) && input.now - startedAt >= DAY_MS && daysLeft < TRIAL_DAYS) {
    return due('started');
  }

  return { send: false };
}

/** The key a sent note is recorded under. Exported so the caller cannot invent its own shape. */
export function nudgeKey(stage: NudgeStage, endsAt: string): string {
  return `${stage}:${endsAt}`;
}
