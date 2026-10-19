import { effectiveTierOf, type AdminEntitlementView } from '../services/adminEntitlements';
import type { Tier } from '../config/tiers';

/**
 * The Users tab's plan chips.
 *
 * Search, a broker toggle and five sorts were the whole toolkit, and most support questions start
 * with "who's on Gold and…". A chip per plan, one for anyone on a trial, and one for the people
 * paying and not using it — the dormant panel's question, asked as a list.
 */
export type PlanFilter = 'all' | Tier | 'trial' | 'paying-idle';

export const PLAN_FILTERS: { id: PlanFilter; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'free', label: 'Free' },
  { id: 'silver', label: 'Silver' },
  { id: 'gold', label: 'Gold' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'trial', label: 'On trial' },
  { id: 'paying-idle', label: 'Paying, no trades' },
];

/** Whether a trial is running right now, by the end date the webhook wrote. */
export function onTrial(record: AdminEntitlementView | null, now: number): boolean {
  if (!record?.trialEndsAt) return false;
  const ends = Date.parse(record.trialEndsAt);
  return Number.isFinite(ends) && ends > now;
}

export function matchesPlanFilter(
  filter: PlanFilter,
  user: { tradeCount: number },
  record: AdminEntitlementView | null,
  now: number,
): boolean {
  if (filter === 'all') return true;
  const tier = effectiveTierOf(record, now);
  if (filter === 'trial') return onTrial(record, now);
  if (filter === 'paying-idle') return tier !== 'free' && user.tradeCount === 0;
  return tier === filter;
}
