/**
 * What this product costs to run, per unit.
 *
 * One file, because the alternative is the same numbers half-remembered in three places and a
 * pricing decision made against a stale one. Everything here is overridable by environment
 * variable, so a rate change is a Netlify setting rather than a deploy — and every default carries
 * the date it was checked, because a hardcoded price with no date is a lie waiting to happen.
 *
 * These are ESTIMATES priced from published rates, not from invoices. The panel says so. Use them
 * to decide whether a discount clears the floor, not to reconcile a statement.
 */

function num(name: string, fallback: number): number {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface CostRates {
  /**
   * SnapTrade, per connected user per month. One charge per PERSON — not per broker, not per
   * account, so somebody on Diamond with ten brokerages costs exactly the same as somebody on
   * Silver with one. This is why broker connections are unlimited on every paid plan.
   *
   * Two things about it that the arithmetic elsewhere depends on. It is NOT prorated: a user is
   * billable for the whole month if they had a connection at any point in it, so a connection
   * left standing over the 1st costs a full month for a day of it. And an INACTIVE connection
   * still counts — a link SnapTrade has stopped being able to use is billed exactly like a
   * working one until it is deleted. That is what the broker reaper exists for.
   *
   * $1.00 is the rate on the production client id (TREND-CHASERS-TNNCU), read off the SnapTrade
   * billing dashboard in Sep 2026 — not off their public pricing page, which quotes a higher
   * Commercial default. The dashboard is the authority; it is the thing that generates the
   * invoice.
   */
  connectedUserMonth: number;
  /**
   * SnapTrade, per successful MANUAL REFRESH — and this app has never performed one.
   *
   * The distinction is worth writing down because it was wrong here for a month and cost a
   * pricing decision. A manual refresh is refreshBrokerageAuthorization: forcing a brokerage to
   * hand over intraday holdings, ahead of the daily sync. Reading trades is not that. Trade
   * activity is cached by SnapTrade, refreshed once a day as part of the per-user fee above, and
   * delivered a day behind — so getAccountActivities, which is the only call behind the Sync
   * button and behind the automatic morning import, costs nothing per call.
   *
   * Kept at the dashboard's rate rather than deleted, because the moment this app calls
   * refreshBrokerageAuthorization the number becomes live again. Nothing currently multiplies by
   * it: see priceUsage.
   */
  manualRefresh: number;
  /** One assistant message, all-in. gpt-5-mini at $0.25/M in and $2.00/M out, assuming a full
   *  3,000-token completion budget and ~3,000 tokens of facts and history going in. Deliberately
   *  the pessimistic end: gpt-5-mini is a reasoning model, so hidden thinking is billed as output
   *  and a long answer really can reach the cap. Checked Sep 2026. */
  aiMessage: number;
  /** One dashboard takeaway. Same model, 2,000-token budget, a much smaller prompt. */
  takeaway: number;
  /** Creem's cut of each charge. */
  creemPercent: number;
  /** Creem's flat fee per charge — the part that hurts on a $5 plan, and the reason annual
   *  billing is worth a discount. */
  creemFlat: number;
}

export const COST_RATES: CostRates = {
  connectedUserMonth: num('COST_CONNECTED_USER', 1.0),
  manualRefresh: num('COST_MANUAL_REFRESH', 0.05),
  aiMessage: num('COST_AI_MESSAGE', 0.0068),
  takeaway: num('COST_TAKEAWAY', 0.0045),
  creemPercent: num('COST_CREEM_PERCENT', 0.039),
  creemFlat: num('COST_CREEM_FLAT', 0.4),
};

/** The month the paid tiers went live, as YYYY-MM. Before this there was nothing to bill. */
export function launchMonth(): string {
  const raw = typeof process !== 'undefined' ? process.env?.PAID_LAUNCH_MONTH : undefined;
  return /^\d{4}-\d{2}$/.test(raw ?? '') ? (raw as string) : '';
}

export interface UsageCounts {
  aiMessages: number;
  takeaways: number;
  syncs: number;
  /** Distinct people who ran at least one sync — the floor for SnapTrade's per-user fee. */
  syncingUsers: number;
  /** Charges collected, for the processor's cut. */
  charges: number;
  revenue: number;
}

export interface CostBreakdown {
  ai: number;
  takeaways: number;
  /**
   * What syncing cost. Zero, and kept in the shape so the admin panel can say so.
   *
   * A line reading $0.00 next to a count of nine thousand syncs is worth more than no line at
   * all: it is the answer to "should I be charging more for syncs", and the absence of the row
   * is how that question gets re-asked every quarter.
   */
  syncs: number;
  connectedUsers: number;
  processor: number;
  total: number;
}

/** Price a month's usage. Pure — the same counts always give the same answer. */
export function priceUsage(counts: UsageCounts, rates: CostRates = COST_RATES): CostBreakdown {
  const ai = counts.aiMessages * rates.aiMessage;
  const takeaways = counts.takeaways * rates.takeaway;
  /*
   * Not multiplied by anything.
   *
   * Reading trade activity is included in the per-user fee — SnapTrade caches transactions and
   * refreshes them daily, and the only thing they bill per call is a manual holdings refresh this
   * app never performs. This used to be `counts.syncs * 0.05`, which invented a cost that has
   * never appeared on an invoice and made every plan look worse than it is.
   */
  const syncs = 0;
  const connectedUsers = counts.syncingUsers * rates.connectedUserMonth;
  const processor = counts.revenue * rates.creemPercent + counts.charges * rates.creemFlat;

  return {
    ai,
    takeaways,
    syncs,
    connectedUsers,
    processor,
    total: ai + takeaways + syncs + connectedUsers + processor,
  };
}

/**
 * What one user on a tier costs if they hit every daily cap, every day of the month.
 *
 * The number that decides whether a discount is safe. It is a ceiling nobody reaches, which is the
 * point: price above it and no individual customer can ever cost more than they pay.
 */
export function worstCaseMonthlyCost(
  plan: { price: number; limits: { syncsPerDay: number; aiMessagesPerDay: number; brokers: number } },
  rates: CostRates = COST_RATES,
  daysInMonth = 31,
): CostBreakdown {
  const connected = plan.limits.brokers > 0 ? 1 : 0;

  return priceUsage(
    {
      aiMessages: plan.limits.aiMessagesPerDay * daysInMonth,
      // Everyone gets the takeaway, paid or not.
      takeaways: daysInMonth,
      // Not the plan's ceiling, which is a sentinel on an unlimited tier and would overflow into
      // a meaningless float. Syncs are free (see priceUsage), so the only honest worst case is
      // "as many as anyone could press", and any large number prices the same: zero.
      syncs: 0,
      syncingUsers: connected,
      charges: plan.price > 0 ? 1 : 0,
      revenue: plan.price,
    },
    rates,
  );
}
