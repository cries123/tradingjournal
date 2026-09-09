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
   * The journal keeps itself up to date — an automatic import every market morning, no button.
   *
   * This is the difference between Diamond and "Gold with bigger numbers". A sync allowance buys
   * impatience, as the note below says; this buys not having to remember. It costs a pull a day
   * per user (see COST_RATES.syncCall), which is why it is one tier rather than all of them.
   */
  autoSync: boolean;
  /**
   * Invite a coach to read the journal and comment on it, with their own free account.
   *
   * Every tier can already hand out a read-only link. What this adds is the coach writing back —
   * a note on a day or a trade that the trader sees in the app.
   */
  coachSeat: boolean;
  /** Told when a risk rule is broken: in the app as it happens, and again the next morning. */
  ruleAlerts: boolean;
  /** The weekly recap is written by the assistant from the journal rather than templated. */
  aiReview: boolean;
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
  /** Creem product id for the yearly price. Absent until annual billing is switched on. */
  annualProductIdEnv?: string;
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

/**
 * Annual billing is built but not switched on.
 *
 * Same pattern as market replay above: the plans carry their yearly price, the pricing page can
 * render the toggle, and the only thing standing between here and selling one is three product
 * ids in Creem. Until those exist the page says "coming soon" rather than opening a checkout
 * that would fail — flipping this to true is the whole change.
 */
export const ANNUAL_BILLING_LIVE = false;

/**
 * Months charged for on an annual plan. Two free is the usual shape, and it is worth more than it
 * looks on a $5 plan: Creem's flat fee per charge is $0.40, so twelve monthly charges lose $4.80
 * to fees where one annual charge loses forty cents.
 */
export const ANNUAL_MONTHS_CHARGED = 10;

/** What a year of this plan costs, in whole dollars. */
export function annualPrice(tier: Tier): number {
  return TIER_PLANS[tier].price * ANNUAL_MONTHS_CHARGED;
}

/** What it works out to per month, for the comparison people actually make. */
export function annualMonthlyEquivalent(tier: Tier): number {
  return Math.round((annualPrice(tier) / 12) * 100) / 100;
}

/*
 * How these numbers were arrived at, because the last set were not.
 *
 * Three costs decide everything here. SnapTrade charges $2.00 per connected PERSON per month —
 * not per brokerage, so broker count is free to give away and is pure differentiation. A manual
 * sync is $0.05, and the daily automatic refresh is already inside the per-user fee, so a sync
 * allowance buys impatience rather than freshness. An assistant message is about $0.0068, which
 * looks like nothing until a daily cap is multiplied by thirty: 50 a day is 1,500 a month and
 * $10.20 of it.
 *
 * Add Creem's 3.9% plus $0.40 a charge and the old ladder left, at full use of every cap, 18% on
 * Silver, 11% on Gold and 29% on Diamond — which is to say the most engaged customers, the ones
 * who never churn, were worth almost nothing. These are set so the WORST case is still healthy
 * (roughly 63% / 54% / 58%), because a plan you resent your best users for using is priced wrong.
 */
export const TIER_PLANS: Record<Tier, TierPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Log trades by hand and keep the full journal.',
    limits: {
      brokers: 0, syncsPerDay: 0, aiMessagesPerDay: 0, marketReplay: false,
      performanceAnalytics: false, autoSync: false, coachSeat: false, ruleAlerts: false, aiReview: false,
    },
  },
  silver: {
    id: 'silver',
    name: 'Silver',
    price: 9,
    tagline: 'Connect a broker and stop typing trades in.',
    limits: {
      brokers: 1, syncsPerDay: 1, aiMessagesPerDay: 0, marketReplay: false,
      performanceAnalytics: true, autoSync: false, coachSeat: false, ruleAlerts: false, aiReview: false,
    },
    productIdEnv: 'CREEM_PRODUCT_SILVER',
    annualProductIdEnv: 'CREEM_PRODUCT_SILVER_ANNUAL',
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    price: 19,
    tagline: 'Three brokers, and an assistant that reads your stats.',
    limits: {
      brokers: 3, syncsPerDay: 3, aiMessagesPerDay: 15, marketReplay: false,
      performanceAnalytics: true, autoSync: false, coachSeat: false, ruleAlerts: false, aiReview: false,
    },
    productIdEnv: 'CREEM_PRODUCT_GOLD',
    annualProductIdEnv: 'CREEM_PRODUCT_GOLD_ANNUAL',
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond',
    price: 39,
    tagline: 'Everything, with room to actually use it.',
    limits: {
      brokers: 5, syncsPerDay: 5, aiMessagesPerDay: 40, marketReplay: true,
      performanceAnalytics: true, autoSync: true, coachSeat: true, ruleAlerts: true, aiReview: true,
    },
    productIdEnv: 'CREEM_PRODUCT_DIAMOND',
    annualProductIdEnv: 'CREEM_PRODUCT_DIAMOND_ANNUAL',
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

export type Feature =
  | 'brokerSync'
  | 'aiAssistant'
  | 'marketReplay'
  | 'performanceAnalytics'
  | 'autoSync'
  | 'coachSeat'
  | 'ruleAlerts'
  | 'aiReview';

/** The limits flag each boolean feature reads, so the three functions below can't disagree. */
const BOOLEAN_FEATURES: Partial<Record<Feature, keyof TierLimits>> = {
  performanceAnalytics: 'performanceAnalytics',
  autoSync: 'autoSync',
  coachSeat: 'coachSeat',
  ruleAlerts: 'ruleAlerts',
  aiReview: 'aiReview',
};

/** The lowest tier that includes each feature, derived from the limits rather than hardcoded. */
export function lowestTierWith(feature: Feature): Tier | null {
  return (
    TIER_ORDER.find((t) => {
      const l = limitsFor(t);
      if (feature === 'brokerSync') return l.brokers > 0;
      if (feature === 'aiAssistant') return l.aiMessagesPerDay > 0;
      if (feature === 'marketReplay') return l.marketReplay;
      return Boolean(l[BOOLEAN_FEATURES[feature]!]);
    }) ?? null
  );
}

export function tierHas(tier: Tier, feature: Feature): boolean {
  const l = limitsFor(tier);
  if (feature === 'brokerSync') return l.brokers > 0;
  if (feature === 'aiAssistant') return l.aiMessagesPerDay > 0;
  // Sold with Diamond, but withheld until it actually works.
  if (feature === 'marketReplay') return l.marketReplay && MARKET_REPLAY_LIVE;
  return Boolean(l[BOOLEAN_FEATURES[feature]!]);
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

  /* The four that make the top tier a different product rather than a bigger one. Listed after
     the counted limits because a count is what somebody compares and a capability is what they
     buy — the eye should arrive at these last and stop. */
  if (l.autoSync) lines.push({ text: 'Trades import themselves every morning — no syncing' });
  if (l.coachSeat) lines.push({ text: 'Invite a coach to read your journal and comment on it' });
  if (l.ruleAlerts) lines.push({ text: 'Risk-rule alerts the moment you break your own limits' });
  if (l.aiReview) lines.push({ text: 'A weekly review written by the assistant, emailed to you' });

  if (l.marketReplay) lines.push({ text: 'Market replay', soon: !MARKET_REPLAY_LIVE });
  return lines;
}
