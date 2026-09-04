import { limitsFor } from '../src/config/tiers';
import { compIsLive } from '../src/config/accessExtension';
import { billingTier, effectiveTier, type Entitlement } from './entitlements';

/**
 * Deciding whether a broker link should be taken away, and when.
 *
 * SnapTrade bills per person who has a connection, whether or not anyone syncs. So a link left
 * behind by someone whose plan no longer includes broker sync is a standing monthly charge
 * against an account that stopped paying — and nothing removes it, because churn looks like never
 * opening the app again rather than pressing Disconnect. This is the job that presses it for them.
 *
 * The decision is pure and lives apart from the run loop so the boundaries can be tested without
 * a Firestore or a SnapTrade. Everything it needs is passed in, including the clock.
 */

/** How long a lapsed account keeps its connection before the link goes. */
export const DEFAULT_GRACE_DAYS = 5;

const DAY_MS = 86_400_000;

export type ReapAction =
  /** Still entitled. If a grace clock was running, it stops. */
  | { action: 'keep'; clearMark: boolean }
  /** Not entitled, but inside the grace period. Records when the clock started, if it hasn't. */
  | { action: 'wait'; lapsedAt: string; reapAfter: string }
  /** Not entitled and out of grace. Take the link. */
  | { action: 'reap'; lapsedAt: string; reason: string };

export interface ReapInput {
  entitlement: Entitlement | null;
  /** When this account was first seen without an entitlement, if a previous run stamped it. */
  unentitledSince?: string | null;
  now: number;
  graceDays?: number;
}

/**
 * When the entitlement actually ran out, as best as the record can say.
 *
 * Preferred over the first time a run noticed, because the run only happens once a day and a
 * trial that ended on Monday shouldn't get its grace period restarted on Tuesday. Falls back to
 * the stamp, and then to now — a record with no dates at all starts its clock here rather than
 * being reaped on sight.
 */
export function lapsedAtFor(input: ReapInput): string {
  const { entitlement: e, unentitledSince, now } = input;
  const known: number[] = [];

  const consider = (iso: string | null | undefined) => {
    if (!iso) return;
    const at = Date.parse(iso);
    // Only dates that have already passed. A period end in the future belongs to an entitlement
    // that is still running, which is not this function's business.
    if (Number.isFinite(at) && at <= now) known.push(at);
  };

  // A comp that has expired is the trial ending. A paid period that has run out is the
  // subscription ending. Whichever happened later is when they actually lost access.
  //
  // The date is read out before the check: compIsLive is a type guard, so inside a negated branch
  // it narrows e.comp to nothing at all and the property is unreachable.
  const compUntil = e?.comp?.until ?? null;
  if (compUntil && !compIsLive(e?.comp ?? null, now)) consider(compUntil);
  if (e && billingTier(e, now) === 'free') consider(e.currentPeriodEnd);

  // A date the record actually carries always wins over the stamp. The stamp says when a run
  // first noticed, and runs happen once a day — so letting it compete would restart the clock
  // for every account whose trial ended before the job got around to looking at it.
  if (known.length > 0) return new Date(Math.max(...known)).toISOString();

  const marked = unentitledSince ? Date.parse(unentitledSince) : NaN;
  if (Number.isFinite(marked) && marked <= now) return new Date(marked).toISOString();

  return new Date(now).toISOString();
}

/** Why this link is going, in words an audit line can carry. */
function reasonFor(e: Entitlement | null, now: number): string {
  if (!e) return 'no plan on the account';
  if (e.comp && !compIsLive(e.comp, now)) return 'complimentary access ended';
  if (e.status === 'canceled') return 'subscription cancelled';
  if (e.status === 'past_due') return 'payment failed';
  if (e.status === 'expired') return 'subscription expired';
  return `on ${e.tier}, which has no broker connections`;
}

/**
 * What to do about one connected account.
 *
 * Entitlement is read through effectiveTier, so a live grant or a running trial protects the link
 * exactly as a paid subscription does — there is no separate list of people to spare.
 */
export function decideReap(input: ReapInput): ReapAction {
  const { entitlement, now } = input;
  const graceDays = input.graceDays ?? DEFAULT_GRACE_DAYS;

  if (limitsFor(effectiveTier(entitlement, now)).brokers > 0) {
    // Entitled again. Someone who subscribed during grace must not carry a half-run clock into
    // the next lapse, so the stamp is cleared rather than left to shorten a future grace period.
    return { action: 'keep', clearMark: Boolean(input.unentitledSince) };
  }

  const lapsedAt = lapsedAtFor(input);
  const reapAt = Date.parse(lapsedAt) + graceDays * DAY_MS;

  if (now < reapAt) {
    return { action: 'wait', lapsedAt, reapAfter: new Date(reapAt).toISOString() };
  }

  return { action: 'reap', lapsedAt, reason: reasonFor(entitlement, now) };
}

/* ------------------------------------------------------------------ the run */

/**
 * A ceiling, not a target.
 *
 * Past this the run stops and the rest go next time. Deleting broker links is the most
 * destructive thing this codebase does on a timer, so a bug that widens the net can only reach
 * this many people in a day, and there is a day to notice.
 */
export const MAX_REAPS_PER_RUN = 50;

export interface ReapSummary {
  considered: number;
  reaped: number;
  waiting: number;
  kept: number;
  failed: number;
  dryRun: boolean;
  /** Who lost a link, and why — enough to answer a support ticket about it. */
  details: { uid: string; reason: string; lapsedAt: string }[];
}

export interface ReapDeps {
  /** Accounts that currently hold a broker link, with the grace stamp a previous run left. */
  listConnected: () => Promise<{ uid: string; unentitledSince?: string | null }[]>;
  readEntitlement: (uid: string) => Promise<Entitlement | null>;
  /** Removes the SnapTrade user, which is what actually ends the monthly charge. */
  removeLink: (uid: string) => Promise<void>;
  /** Persists (or clears) when this account was first seen without an entitlement. */
  markUnentitledSince: (uid: string, at: string | null) => Promise<void>;
  now?: number;
  graceDays?: number;
  /** Decides nothing differently — just doesn't carry it out, so a run can be inspected first. */
  dryRun?: boolean;
}

/**
 * Walks the connected accounts once and applies the decision to each.
 *
 * One account's failure never ends the run: a SnapTrade outage on the third user must not leave
 * the remaining forty-seven billing for another day.
 */
export async function runReap(deps: ReapDeps): Promise<ReapSummary> {
  const now = deps.now ?? Date.now();
  const dryRun = deps.dryRun ?? false;
  const summary: ReapSummary = {
    considered: 0,
    reaped: 0,
    waiting: 0,
    kept: 0,
    failed: 0,
    dryRun,
    details: [],
  };

  const connected = await deps.listConnected();

  for (const row of connected) {
    if (summary.reaped >= MAX_REAPS_PER_RUN) break;
    summary.considered += 1;

    try {
      const decision = decideReap({
        entitlement: await deps.readEntitlement(row.uid),
        unentitledSince: row.unentitledSince,
        now,
        graceDays: deps.graceDays,
      });

      if (decision.action === 'keep') {
        summary.kept += 1;
        if (decision.clearMark && !dryRun) await deps.markUnentitledSince(row.uid, null);
        continue;
      }

      if (decision.action === 'wait') {
        summary.waiting += 1;
        // Stamped only when it isn't already, so the clock cannot be pushed forward by a rerun.
        if (!row.unentitledSince && !dryRun) {
          await deps.markUnentitledSince(row.uid, decision.lapsedAt);
        }
        continue;
      }

      if (!dryRun) {
        await deps.removeLink(row.uid);
        await deps.markUnentitledSince(row.uid, null);
      }
      summary.reaped += 1;
      summary.details.push({ uid: row.uid, reason: decision.reason, lapsedAt: decision.lapsedAt });
    } catch (err) {
      summary.failed += 1;
      console.error(`[reap-broker-links] ${row.uid} failed:`, err);
    }
  }

  return summary;
}
