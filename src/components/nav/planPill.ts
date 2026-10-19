import type { Tier } from '../../config/tiers';

/**
 * The plan as a small coloured pill, in the colours the plan card has always used for each tier,
 * so Gold reads as gold in the sidebar, on More and on the plan card alike.
 */
export const PLAN_PILL: Record<Tier, string> = {
  free: 'bg-bg-tertiary text-text-secondary border border-border',
  silver: 'bg-slate-300/10 text-slate-300 border border-slate-300/25',
  gold: 'bg-amber-300/10 text-amber-300 border border-amber-300/30',
  diamond: 'bg-sky-300/10 text-sky-300 border border-sky-300/25',
};
