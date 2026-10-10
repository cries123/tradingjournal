/**
 * Month-on-month movement in paying customers.
 *
 * Its own module, importing nothing, because it runs in two places: the browser's tests and the
 * cost handler on the server, which computes it from the whole payment ledger. Anything this file
 * imported from src/services would drag browser code (window, the Firestore client) into the server
 * typecheck, which is what happened when it lived in adminRisk.ts.
 */

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
  // Only the two fields read, so the cost handler can call this on the server with its own month
  // shape — one tested implementation rather than a second copy that could drift from it.
  months: { month: string; counts: { revenue: number } }[],
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
