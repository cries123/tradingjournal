import { trialPatch, type Entitlement } from './entitlements';

/**
 * Finds trials the webhook never marked, by asking Creem.
 *
 * The three trial emails key on trialEndsAt, which only the webhook writes, and only when an event
 * says "trialing". Nothing in this repo can prove Creem sends that for this product — the nudge job
 * says as much in its own log line — and a trial that is never marked gets no emails at all,
 * including the one that says when the card is charged. That silence is how a chargeback starts.
 *
 * So once per paying account, ever, the subscription is read back from Creem. A trial gets the same
 * patch the webhook would have written; anything else is stamped as checked and never asked about
 * again. The cost is one free GET per subscriber for the life of the account.
 *
 * Trials that began before trial tracking shipped (1 October) cannot be helped by this or anything:
 * at seven days each they had all ended by the 9th.
 */

/** The most subscriptions looked up in one run. The rest are next morning's. */
export const MAX_TRIAL_CHECKS_PER_RUN = 50;

export interface CreemSubscriptionState {
  status?: string;
  current_period_end_date?: string;
}

export interface TrialBackfillDeps {
  /** Purchased entitlements. Filtered here, so the caller can over-fetch. */
  candidates: () => Promise<{ uid: string; entitlement: Entitlement }[]>;
  fetchSubscription: (subscriptionId: string) => Promise<CreemSubscriptionState>;
  write: (uid: string, patch: Partial<Entitlement>) => Promise<void>;
  /** The one-trial-per-mailbox record the webhook keeps. Best effort. */
  rememberTrial?: (uid: string) => Promise<void>;
  nowIso: string;
  maxPerRun?: number;
}

/** A live purchased subscription nobody has yet asked Creem about. */
export function needsTrialCheck(e: Entitlement | null): boolean {
  return Boolean(
    e &&
      e.source === 'purchase' &&
      e.status === 'active' &&
      e.creemSubscriptionId &&
      // Already marked by the webhook: nothing to find.
      !e.trialStartedAt &&
      !e.trialCheckedAt,
  );
}

export async function backfillTrialMarkers(
  deps: TrialBackfillDeps,
): Promise<{ checked: number; found: number; failed: number }> {
  const result = { checked: 0, found: 0, failed: 0 };
  const limit = deps.maxPerRun ?? MAX_TRIAL_CHECKS_PER_RUN;

  const due = (await deps.candidates()).filter((c) => needsTrialCheck(c.entitlement)).slice(0, limit);

  for (const { uid, entitlement } of due) {
    let sub: CreemSubscriptionState;
    try {
      sub = await deps.fetchSubscription(entitlement.creemSubscriptionId!);
    } catch (err) {
      // Not stamped: a Creem blip must not mark an account as checked and lose its trial for good.
      result.failed += 1;
      console.warn(`[trial-backfill] could not read ${uid}'s subscription:`, err instanceof Error ? err.message : err);
      continue;
    }

    result.checked += 1;
    if (sub.status !== 'trialing') {
      await deps.write(uid, { trialCheckedAt: deps.nowIso });
      continue;
    }

    // The webhook's own rule for what a trial looks like, so the two can never disagree about a date.
    const patch = trialPatch({ trialing: true, currentPeriodEnd: sub.current_period_end_date }, deps.nowIso, entitlement);
    await deps.write(uid, { ...patch, trialCheckedAt: deps.nowIso });
    result.found += 1;
    await deps.rememberTrial?.(uid).catch(() => undefined);
  }

  return result;
}
