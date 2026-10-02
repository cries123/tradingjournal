import type { AdminEntitlementView } from '../services/adminEntitlements';
import type { AdminUserSummary } from '../services/admin';
import type { MonthCosts } from '../services/adminCosts';
import { TIER_PLANS, type Tier } from '../config/tiers';
import { DAY_MS } from '../config/accessExtension';

/**
 * The four questions the admin panel could answer from data it already loads, and did not.
 *
 * Every one of these is a derivation, not a new read: the entitlements map, the user list, the
 * broker-connection map and the cost report are all in the page already. Pure and here rather than
 * inside the panels, because each is an argument about money — which accounts are leaving, how many
 * trials convert, whether the business grew this month — and an argument should be testable without
 * a browser.
 */

/* ------------------------------------------------------------------ money at risk */

export type RiskKind =
  | 'card-declined'
  | 'leaving'
  | 'trial-not-connected'
  | 'trial-cancelled';

export interface RiskRow {
  uid: string;
  email: string;
  username: string | null;
  kind: RiskKind;
  tier: Tier;
  /** Monthly value of what is at risk. Zero where nothing is being paid yet. */
  value: number;
  /** When it bites: the day access ends, or the day the card is charged. */
  on: string | null;
  /** Days until that, rounded down. Negative once it has passed. */
  daysAway: number | null;
}

/** How each kind reads, and how loudly. Ordered worst first — this is also the sort. */
export const RISK_ORDER: RiskKind[] = [
  'card-declined',
  'leaving',
  'trial-cancelled',
  'trial-not-connected',
];

const daysUntil = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.floor((at - now) / DAY_MS) : null;
};

const liveTrialEnd = (e: AdminEntitlementView, now: number): string | null => {
  if (!e.trialEndsAt) return null;
  const ends = Date.parse(e.trialEndsAt);
  return Number.isFinite(ends) && ends > now ? e.trialEndsAt : null;
};

/**
 * Accounts where money is about to stop, or has already stopped arriving.
 *
 * Nothing in the panel showed any of this. `past_due` and `canceled` appeared in exactly one place —
 * inside a single user's modal, which you would only open if you already knew to look. The webhook
 * emails the CUSTOMER when their card fails; the owner found out when they wrote in.
 *
 * A hand-granted plan is never at risk: nobody is paying for it, so there is nothing to lose and the
 * row would be noise on the one screen that must stay short enough to read.
 */
export function moneyAtRisk(
  users: AdminUserSummary[],
  entitlements: Map<string, AdminEntitlementView>,
  connected: (uid: string) => boolean,
  now: number,
): RiskRow[] {
  const rows: RiskRow[] = [];

  for (const user of users) {
    const e = entitlements.get(user.uid);
    if (!e || e.source === 'admin') continue;

    const plan = TIER_PLANS[e.tier];
    const base = {
      uid: user.uid,
      email: user.email,
      username: user.username,
      tier: e.tier,
      value: plan?.price ?? 0,
    };

    const trialEnd = liveTrialEnd(e, now);

    if (e.status === 'past_due') {
      // The only kind with no date: Creem retries on its own schedule and we are not told it. What
      // matters is that it is already happening, which is why it sorts first.
      rows.push({ ...base, kind: 'card-declined', on: null, daysAway: null });
      continue;
    }

    if (trialEnd) {
      if (e.status === 'canceled') {
        rows.push({ ...base, kind: 'trial-cancelled', value: 0, on: trialEnd, daysAway: daysUntil(trialEnd, now) });
      } else if (!connected(user.uid)) {
        /*
         * A trial with no brokerage connected is the one that will not convert.
         *
         * Broker sync is the only thing this product charges for, so somebody who reaches the end of
         * a trial without connecting has not seen what they are about to be billed for. This is the
         * row where an email still changes the outcome.
         */
        rows.push({ ...base, kind: 'trial-not-connected', value: 0, on: trialEnd, daysAway: daysUntil(trialEnd, now) });
      }
      continue;
    }

    if (e.status === 'canceled' && e.currentPeriodEnd) {
      const days = daysUntil(e.currentPeriodEnd, now);
      // Already gone is history, not risk. The row is for the window where they can still be kept.
      if (days !== null && days >= 0) {
        rows.push({ ...base, kind: 'leaving', on: e.currentPeriodEnd, daysAway: days });
      }
    }
  }

  return rows.sort((a, b) => {
    const kindDiff = RISK_ORDER.indexOf(a.kind) - RISK_ORDER.indexOf(b.kind);
    if (kindDiff !== 0) return kindDiff;
    // Soonest first inside a kind; a row with no date sorts before one that has weeks left.
    return (a.daysAway ?? -Infinity) - (b.daysAway ?? -Infinity);
  });
}

/* ------------------------------------------------------------------ trials */

export interface TrialStats {
  /** Accounts that have ever started one. */
  started: number;
  /** Of those, the ones that went on to pay. */
  converted: number;
  /** Running right now. */
  live: number;
  /** Started, ended, never paid. */
  lapsed: number;
  /** converted / (converted + lapsed), as a percentage. Null until a trial has finished. */
  conversionRate: number | null;
}

/**
 * How many trials turn into customers.
 *
 * The acquisition funnel stopped at "connected a broker" — one stage short of the only transition
 * that earns anything. This was impossible to compute at all until the webhook started recording
 * trialStartedAt, so it answers for trials from that point on and says nothing about older ones.
 *
 * Conversion deliberately excludes trials still running: counting them as failures makes every
 * healthy week look like a collapse, and counting them as successes is a guess.
 */
export function trialStats(
  entitlements: Map<string, AdminEntitlementView>,
  hasPaid: (uid: string) => boolean,
  now: number,
): TrialStats {
  let started = 0;
  let converted = 0;
  let live = 0;

  for (const [uid, e] of entitlements) {
    if (!e.trialStartedAt) continue;
    started += 1;

    if (liveTrialEnd(e, now)) {
      live += 1;
      continue;
    }

    // Paid is read from the ledger, never from the plan: a trialling account already reads as an
    // active subscriber, so "has a tier" would count every trial as a conversion on day one.
    if (hasPaid(uid)) converted += 1;
  }

  const finished = started - live;
  const lapsed = finished - converted;

  return {
    started,
    converted,
    live,
    lapsed: Math.max(0, lapsed),
    conversionRate: finished > 0 ? (converted / finished) * 100 : null,
  };
}

/* ------------------------------------------------------------------ MRR movement */

export interface MonthMovement {
  month: string;
  /** Collected, straight from the ledger — what the bank saw. */
  revenue: number;
  /** Accounts that paid this month and had never paid before. */
  newCustomers: number;
  /** Accounts that paid last month and did not this month. */
  churned: number;
  /** newCustomers - churned. The direction, which a total cannot show. */
  net: number;
}

/**
 * Where the revenue went, rather than what it totalled.
 *
 * The costs screen already shows collected per month, and a total says nothing about direction: two
 * flat months can be a stable business or half the customers leaving and half as many arriving.
 *
 * Counted from the charge ledger rather than from entitlements, because an entitlement only holds
 * the state an account is in NOW — once somebody cancels there is nothing left saying they used to
 * pay, so a month that has already closed cannot be reconstructed from it.
 */
export function mrrMovement(
  months: MonthCosts[],
  purchases: { uid: string; at: string }[],
): MonthMovement[] {
  const payersByMonth = new Map<string, Set<string>>();

  for (const p of purchases) {
    const month = (p.at ?? '').slice(0, 7);
    if (month.length !== 7 || !p.uid) continue;
    const set = payersByMonth.get(month) ?? new Set<string>();
    set.add(p.uid);
    payersByMonth.set(month, set);
  }

  // Oldest first, so "had they ever paid before" is a question about months already walked.
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const everPaid = new Set<string>();

  return ordered.map((m, i) => {
    const payers = payersByMonth.get(m.month) ?? new Set<string>();
    const previous = i > 0 ? payersByMonth.get(ordered[i - 1].month) ?? new Set<string>() : new Set<string>();

    let newCustomers = 0;
    for (const uid of payers) if (!everPaid.has(uid)) newCustomers += 1;

    /*
     * Churn is one month of silence, not a cancellation event.
     *
     * Nothing records the moment somebody leaves — a cancelled subscription simply stops producing
     * charges — so the measurable version is "paid last month, did not pay this month". It lags by a
     * month and it over-reports anyone whose renewal lands either side of a month boundary, which is
     * why the panel says "stopped paying" rather than "churned".
     */
    let churned = 0;
    for (const uid of previous) if (!payers.has(uid)) churned += 1;

    for (const uid of payers) everPaid.add(uid);

    return { month: m.month, revenue: m.counts.revenue, newCustomers, churned, net: newCustomers - churned };
  });
}

/* ------------------------------------------------------------------ dormant subscribers */

/** No trade logged in this long, on a paid plan, reads as somebody on the way out. */
export const DORMANT_DAYS = 21;

export interface DormantRow {
  uid: string;
  email: string;
  username: string | null;
  tier: Tier;
  value: number;
  /** Days since they last added or edited a trade. Null when they never have. */
  quietFor: number | null;
}

/**
 * Paying, and not using it.
 *
 * The only list here that lets the owner act BEFORE the decision rather than after it. A subscriber
 * who has not logged a trade in three weeks has already stopped getting value; the cancellation is
 * just the paperwork catching up.
 *
 * Twenty-one days because this is sold to day traders — a week of silence is a holiday, and a month
 * is too late to be worth an email. Hand-granted plans are excluded for the same reason they are
 * excluded from the risk list: nobody is paying, so there is nothing to save.
 */
export function dormantSubscribers(
  users: AdminUserSummary[],
  entitlements: Map<string, AdminEntitlementView>,
  now: number,
): DormantRow[] {
  const rows: DormantRow[] = [];

  for (const user of users) {
    const e = entitlements.get(user.uid);
    if (!e || e.source === 'admin' || e.status !== 'active') continue;
    const plan = TIER_PLANS[e.tier];
    if (!plan || plan.price <= 0) continue;
    // A trial is not dormancy. They have not decided yet, and the trial list already covers them.
    if (liveTrialEnd(e, now)) continue;

    const last = user.lastTradeActivityAt ? Date.parse(user.lastTradeActivityAt) : null;
    const quietFor = last !== null && Number.isFinite(last) ? Math.floor((now - last) / DAY_MS) : null;

    // Never logged anything counts: somebody paying who has never used it is the clearest case of
    // all, and reads as null rather than as a huge number of days.
    if (quietFor === null || quietFor >= DORMANT_DAYS) {
      rows.push({
        uid: user.uid,
        email: user.email,
        username: user.username,
        tier: e.tier,
        value: plan.price,
        quietFor,
      });
    }
  }

  // Longest silence first, with "never" at the top.
  return rows.sort((a, b) => (b.quietFor ?? Number.MAX_SAFE_INTEGER) - (a.quietFor ?? Number.MAX_SAFE_INTEGER));
}
