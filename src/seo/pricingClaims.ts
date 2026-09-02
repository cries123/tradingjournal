import { MARKET_REPLAY_LIVE, TIER_PLANS, lowestTierWith, tierHas, type Feature } from '../config/tiers';

/**
 * What is free and what is not, built from the plans.
 *
 * Every wrong pricing claim on this site has been the same mistake: a sentence typed while it was
 * true and left alone when the plans changed. Two broker guides said sync was free. The landing FAQ
 * said the free journal included "performance analytics, optional broker sync" — and that answer is
 * emitted as schema.org FAQPage markup, so the stale version is the one Google was handed.
 *
 * The paid half is derived, because that is the half that has been wrong every time.
 */

/** The cheapest plan that includes a feature. Null for anything free, or not yet shipped. */
export function priceOf(feature: Feature): { name: string; price: number } | null {
  const tier = lowestTierWith(feature);
  if (!tier || tier === 'free') return null;
  // tierHas, not the limits: market replay is sold with Diamond but withheld until it works, and
  // marketing copy must not advertise a feature the app refuses to run.
  if (!tierHas(tier, feature)) return null;
  return { name: TIER_PLANS[tier].name, price: TIER_PLANS[tier].price };
}

/** The lowest price of any paid plan, for "from $N a month". */
export function lowestPaidPrice(): number {
  return Math.min(...Object.values(TIER_PLANS).filter((p) => p.price > 0).map((p) => p.price));
}

const FEATURE_NAMES: Record<Feature, string> = {
  brokerSync: 'broker sync',
  performanceAnalytics: 'the performance screen',
  aiAssistant: 'the AI assistant',
  marketReplay: 'market replay',
};

/** Every feature a free account does not get, named — and only the ones that actually work. */
export function paidFeatureNames(): string[] {
  return (Object.keys(FEATURE_NAMES) as Feature[])
    .filter((f) => priceOf(f) !== null)
    .map((f) => FEATURE_NAMES[f]);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * What the free plan gets, in a snippet-sized phrase.
 *
 * Short on purpose: this answer is what a search result shows, and a rich snippet is truncated
 * long before the full feature list from the pricing card would end. Written out rather than
 * derived — but a test asserts it names none of the paid features, which is the mistake that keeps
 * happening.
 */
export const FREE_INCLUSIONS =
  'unlimited manual logging, the P&L calendar, dashboard stats, notes, tags, screenshots, coach '
  + 'share links and the year-end export for your accountant';

/** The answer to "is it free?" — accurate in both directions. */
export function freeAnswer(): string {
  return (
    `The journal is: ${FREE_INCLUSIONS}, with no trade limit and no credit card. `
    + `What costs money is the automation — ${joinList(paidFeatureNames())} are on paid plans, from `
    + `$${lowestPaidPrice()} a month, because every brokerage connection carries a monthly fee we `
    + 'pay whether you sync once or a hundred times.'
  );
}

/** Exported for the test that checks nothing unshipped is being advertised. */
export const MARKET_REPLAY_IS_LIVE = MARKET_REPLAY_LIVE;
