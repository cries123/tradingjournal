/**
 * What each plan includes — the single source of truth, imported by both the client and the server.
 *
 * Limits live here rather than in the UI or in an env var because they are enforced in two places
 * and displayed in a third. When "15 AI messages" is written down once, the badge, the paywall and
 * the server that actually refuses the 16th request cannot drift apart.
 *
 * Every number here is a ceiling the SERVER enforces. The client reads the same values to decide
 * what to show, but a client that lies about its tier gets refused anyway.
 */

export type Tier = 'free' | 'silver' | 'gold' | 'diamond';

/** Ascending, so `TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b)` answers "at least this tier". */
export const TIER_ORDER: Tier[] = ['free', 'silver', 'gold', 'diamond'];

export interface TierLimits {
  /** How many brokerage connections may be live at once. 0 means broker sync is not included. */
  brokers: number;
  /** Broker imports permitted per market day (midnight Eastern). Each one costs a SnapTrade call, hence the cap. */
  syncsPerDay: number;
  /** Assistant questions per market day. 0 means the assistant is not included. */
  aiMessagesPerDay: number;
  /** Market replay. Built but not shipped — see MARKET_REPLAY_LIVE. */
  marketReplay: boolean;
  /**
   * The Performance screen: hour-of-day, setup breakdown, expectancy in R, excursions, discipline.
   *
   * A flag rather than a count because it is one screen you either have or don't. Free keeps the
   * whole journal — calendar, dashboard, notes, grading, the tax export — so this gates the
   * analysis of the data, never the recording of it or getting it back out.
   */
  performanceAnalytics: boolean;
}

export interface TierPlan {
  id: Tier;
  name: string;
  /** Whole dollars per month. Free is 0. */
  price: number;
  tagline: string;
  limits: TierLimits;
  /** Creem product id, set per environment. Absent for free, which is never purchased. */
  productIdEnv?: string;
}

/**
 * Market replay is sold as part of Diamond but is not finished.
 *
 * Flipping this to true is the only change needed when it ships — the plan already grants it, the
 * gate already checks it, and nobody has to be re-entitled. Until then the pricing page says
 * "coming soon" against that line rather than implying it works today, which is the difference
 * between anticipation and a refund request.
 */
export const MARKET_REPLAY_LIVE = false;

export const TIER_PLANS: Record<Tier, TierPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Log trades by hand and keep the full journal.',
    limits: { brokers: 0, syncsPerDay: 0, aiMessagesPerDay: 0, marketReplay: false, performanceAnalytics: false },
  },
  silver: {
    id: 'silver',
    name: 'Silver',
    price: 5,
    tagline: 'Connect a broker and stop typing trades in.',
    limits: { brokers: 1, syncsPerDay: 1, aiMessagesPerDay: 0, marketReplay: false, performanceAnalytics: true },
    productIdEnv: 'CREEM_PRODUCT_SILVER',
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    price: 10,
    tagline: 'Two brokers, and an assistant that reads your stats.',
    limits: { brokers: 2, syncsPerDay: 2, aiMessagesPerDay: 15, marketReplay: false, performanceAnalytics: true },
    productIdEnv: 'CREEM_PRODUCT_GOLD',
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond',
    price: 25,
    tagline: 'Everything, with room to actually use it.',
    limits: { brokers: 3, syncsPerDay: 3, aiMessagesPerDay: 50, marketReplay: true, performanceAnalytics: true },
    productIdEnv: 'CREEM_PRODUCT_DIAMOND',
  },
};

export const PAID_TIERS: Tier[] = ['silver', 'gold', 'diamond'];

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIER_ORDER as string[]).includes(value);
}

export function limitsFor(tier: Tier): TierLimits {
  return TIER_PLANS[tier].limits;
}

/** True when `tier` is at least `required`. */
export function tierAtLeast(tier: Tier, required: Tier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(required);
}

export type Feature = 'brokerSync' | 'aiAssistant' | 'marketReplay' | 'performanceAnalytics';

/** The lowest tier that includes each feature, derived from the limits rather than hardcoded. */
export function lowestTierWith(feature: Feature): Tier | null {
  return (
    TIER_ORDER.find((t) => {
      const l = limitsFor(t);
      if (feature === 'brokerSync') return l.brokers > 0;
      if (feature === 'aiAssistant') return l.aiMessagesPerDay > 0;
      if (feature === 'performanceAnalytics') return l.performanceAnalytics;
      return l.marketReplay;
    }) ?? null
  );
}

export function tierHas(tier: Tier, feature: Feature): boolean {
  const l = limitsFor(tier);
  if (feature === 'brokerSync') return l.brokers > 0;
  if (feature === 'aiAssistant') return l.aiMessagesPerDay > 0;
  if (feature === 'performanceAnalytics') return l.performanceAnalytics;
  // Sold with Diamond, but withheld until it actually works.
  return l.marketReplay && MARKET_REPLAY_LIVE;
}

/** What each plan lists on the pricing page. Kept beside the limits so they can't disagree. */
export function featureLines(tier: Tier): { text: string; soon?: boolean }[] {
  const l = limitsFor(tier);
  const lines: { text: string; soon?: boolean }[] = [];

  if (tier === 'free') {
    lines.push(
      { text: 'Unlimited manual trade logging' },
      { text: 'P&L calendar, equity curve and dashboard stats' },
      { text: 'Notes, tags, screenshots and grading' },
      { text: 'Share a read-only journal link with a coach' },
      { text: 'Year-end realized P&L export for your accountant' },
    );
    return lines;
  }

  lines.push({ text: 'Everything in ' + TIER_PLANS[TIER_ORDER[TIER_ORDER.indexOf(tier) - 1]].name });
  lines.push({
    text: `${l.brokers} broker connection${l.brokers === 1 ? '' : 's'}`,
  });
  lines.push({
    text: `${l.syncsPerDay} trade sync${l.syncsPerDay === 1 ? '' : 's'} per day`,
  });
  // True of broker import and not of manual entry, so it earns its place on every paid card —
  // and it stops Silver reading as three thin bullets next to Gold's five.
  lines.push({ text: 'Round-trip trades matched for you' });
  if (l.performanceAnalytics) {
    lines.push({ text: 'Performance screen — time of day, setups, expectancy, excursions' });
  }
  if (l.aiMessagesPerDay > 0) {
    lines.push({ text: `AI trade analysis — ${l.aiMessagesPerDay} messages per day` });
  }
  if (l.marketReplay) lines.push({ text: 'Market replay', soon: !MARKET_REPLAY_LIVE });
  return lines;
}
