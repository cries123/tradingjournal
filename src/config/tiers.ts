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

/**
 * The connection count that means "as many as you like".
 *
 * A sentinel rather than Infinity, because this number is JSON-serialised to the browser by the
 * entitlement endpoint and `JSON.stringify(Infinity)` is `null` — which would arrive as a plan
 * with no broker limit at all and lock everybody out of connecting. MAX_SAFE_INTEGER survives the
 * round trip, keeps every `>` and `>=` comparison working unchanged, and reads as unlimited to
 * anything that asks.
 */
export const UNLIMITED_BROKERS = Number.MAX_SAFE_INTEGER;

/**
 * The journal count that means "as many as you like". Finite for the same reason as the others:
 * these limits cross to the browser as JSON, and Infinity arrives as null.
 */
export const UNLIMITED_JOURNALS = Number.MAX_SAFE_INTEGER;


export interface TierLimits {
  /**
   * How many brokerage connections may be live at once. 0 means broker sync is not included.
   *
   * Every paid plan is UNLIMITED_BROKERS, and that is a pricing decision rather than generosity:
   * SnapTrade charges per connected PERSON per month, not per connection, so somebody with five
   * brokerages costs exactly what somebody with one costs. Capping it bought nothing and cost the
   * product a real reason to say yes — a trader with a Schwab account, a Roth and a futures
   * account is not an edge case.
   */
  brokers: number;
  /**
   * Broker imports permitted per market day (midnight Eastern).
   *
   * This used to be a cost control and is not one. SnapTrade meters a manual holdings refresh,
   * which this app never performs; reading trade activity comes out of a cache included in the
   * per-user fee, so a sync costs nothing however often it runs.
   *
   * What remains is a rate limit — a ceiling on how hard one account can hammer somebody else's
   * API — which is why the numbers are generous rather than scarce. Every plan keeps a real
   * ceiling, including the top one: unlimited would leave nothing at all between a scripted
   * client and SnapTrade, and 24 a day is an hourly sync around the clock, which no person
   * trading a US session will ever reach.
   */
  syncsPerDay: number;
  /** Assistant questions per market day. 0 means the assistant is not included. */
  aiMessagesPerDay: number;
  /** Market replay. Built but not shipped — see MARKET_REPLAY_LIVE. */
  marketReplay: boolean;
  /**
   * Separate journals in one account — a live account and a paper one, or one per strategy.
   *
   * Costs nothing to allow, like broker connections, so this is differentiation rather than
   * rationing. It is also the one limit here the server does not enforce: journals live in the
   * user's own settings document, which they can write directly, and the worst case if somebody
   * edits past the cap is that they own more folders. Every limit that guards a real bill — syncs,
   * assistant messages, broker links — is checked server-side. This one is a product boundary, and
   * it is worth being clear about the difference rather than implying otherwise.
   */
  journals: number;
  /**
   * The journal keeps itself up to date — an automatic import every market morning, no button.
   *
   * This is the difference between Diamond and "Gold with bigger numbers". A sync allowance buys
   * impatience — the pull is free and the data is a day old either way — while this buys not
   * having to remember. It is one tier rather than all of them because it is worth paying for,
   * not because it costs anything to run.
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
  /**
   * Replay your own journal against rules you did not follow, and see what it would have changed.
   *
   * Gold and above, and it is the first thing on Gold that is a capability rather than a bigger
   * number — everything else Gold added was more brokers, more syncs, more messages. Costs nothing
   * to run: it is arithmetic over trades already stored, with no market data behind it.
   */
  ruleSimulator: boolean;
  /**
   * Publishing a verified record at /r/<username>.
   *
   * Every paid plan, including the cheapest, because this one is marketing that the customer
   * does for us: each published page is branded and links back. Gating it to Gold would be
   * charging more to be advertised. Free is excluded for the opposite reason — the page says the
   * product vouches for these figures, and we should only vouch for customers.
   *
   * Costs nothing per publish: one document write, and the page is a public Firestore read.
   */
  trackRecord: boolean;
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
 * How these numbers were arrived at, because the last two sets were not.
 *
 * Two costs decide everything here, and one that used to be on the list is not a cost at all.
 *
 * SnapTrade charges $1.00 per connected PERSON per month — not per brokerage, not per account —
 * which is why broker connections are unlimited on every paid plan. Giving away connections costs
 * nothing and answers the trader with a brokerage account, a Roth and a futures account, who is
 * not an edge case.
 *
 * Syncing trades is free. SnapTrade caches transactions, refreshes them once a day as part of
 * that per-user fee, and delivers them a day behind. The $0.05 on their billing dashboard is per
 * successful MANUAL REFRESH — refreshBrokerageAuthorization, forcing intraday holdings out of a
 * brokerage — and this app has never called it. Pricing a sync at $0.05 was an assumption written
 * into costs.ts and never checked against an invoice; it made every plan look worse than it is
 * and it is the reason the per-day sync caps exist at all. Those caps are now a rate limit, not a
 * cost control, and should be read that way when they are next revisited.
 *
 * An assistant message is about $0.0068, which looks like nothing until a daily cap is multiplied
 * by thirty: 40 a day is 1,200 a month and $8.16 of it. That is the only usage-driven cost in the
 * product, and it is the one worth capping.
 *
 * Add Creem's 3.9% plus $0.40 a charge and, at full use of every cap every day, these leave 79%
 * on Silver, 72% on Gold and 71% on Diamond. The earlier ladder left 18% / 11% / 29% — which is
 * to say the most engaged customers, the ones who never churn, were worth almost nothing.
 */
export const TIER_PLANS: Record<Tier, TierPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Log trades by hand and keep the full journal.',
    limits: {
      brokers: 0, syncsPerDay: 0, aiMessagesPerDay: 0, marketReplay: false, journals: 2,
      performanceAnalytics: false, ruleSimulator: false, trackRecord: false, autoSync: false, coachSeat: false, ruleAlerts: false, aiReview: false,
    },
  },
  silver: {
    id: 'silver',
    name: 'Silver',
    price: 9,
    tagline: 'Connect a broker and stop typing trades in.',
    limits: {
      brokers: 5, syncsPerDay: 5, aiMessagesPerDay: 0, marketReplay: false, journals: 3,
      performanceAnalytics: true, ruleSimulator: false, trackRecord: true, autoSync: false, coachSeat: false, ruleAlerts: false, aiReview: false,
    },
    productIdEnv: 'CREEM_PRODUCT_SILVER',
    annualProductIdEnv: 'CREEM_PRODUCT_SILVER_ANNUAL',
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    price: 19,
    tagline: 'Ten brokers, and an assistant that reads your stats.',
    limits: {
      brokers: 10, syncsPerDay: 10, aiMessagesPerDay: 15, marketReplay: false, journals: 5,
      performanceAnalytics: true, ruleSimulator: true, trackRecord: true, autoSync: false, coachSeat: false, ruleAlerts: false, aiReview: false,
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
      brokers: UNLIMITED_BROKERS, syncsPerDay: 24, aiMessagesPerDay: 40, marketReplay: true,
      journals: UNLIMITED_JOURNALS,
      performanceAnalytics: true, ruleSimulator: true, trackRecord: true, autoSync: true, coachSeat: true, ruleAlerts: true, aiReview: true,
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

/** True when a plan places no ceiling on brokerage connections. */
export function brokersUnlimited(limits: TierLimits): boolean {
  return limits.brokers >= UNLIMITED_BROKERS;
}

/** True when a plan places no ceiling on journals. */
export function journalsUnlimited(limits: TierLimits): boolean {
  return limits.journals >= UNLIMITED_JOURNALS;
}

/**
 * Whether there is room for another journal.
 *
 * A function rather than a comparison written at the call site, so the one place that enforces it
 * and the three places that grey out a button cannot end up disagreeing about whether "5 journals"
 * means five or six.
 */
export function hasJournalRoom(limits: TierLimits, current: number): boolean {
  return current < limits.journals;
}

/** "Unlimited journals" / "3 journals", for anywhere the allowance is shown. */
export function journalsLabel(limits: TierLimits): string {
  if (limits.journals <= 1) return 'One journal';
  if (journalsUnlimited(limits)) return 'Unlimited journals';
  return `${limits.journals} journals`;
}

/** "24 trade syncs a day", for anywhere the allowance is shown. */
export function syncsLabel(limits: TierLimits): string {
  if (limits.syncsPerDay <= 0) return 'No trade syncs';
  return `${limits.syncsPerDay} trade sync${limits.syncsPerDay === 1 ? '' : 's'} a day`;
}

/** "Unlimited broker connections" / "1 broker connection", for anywhere the count is shown. */
export function brokersLabel(limits: TierLimits): string {
  if (limits.brokers <= 0) return 'No broker connections';
  if (brokersUnlimited(limits)) return 'Unlimited broker connections';
  return `${limits.brokers} broker connection${limits.brokers === 1 ? '' : 's'}`;
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
  | 'ruleSimulator'
  | 'trackRecord'
  | 'autoSync'
  | 'coachSeat'
  | 'ruleAlerts'
  | 'aiReview';

/** The limits flag each boolean feature reads, so the three functions below can't disagree. */
const BOOLEAN_FEATURES: Partial<Record<Feature, keyof TierLimits>> = {
  performanceAnalytics: 'performanceAnalytics',
  ruleSimulator: 'ruleSimulator',
  trackRecord: 'trackRecord',
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

export interface FeatureLine {
  text: string;
  soon?: boolean;
  /**
   * Printed on every card that includes it, even though the card below already showed it.
   *
   * The deliberate exception to the inheritance rule below, and it should stay a very short
   * list. A line earns it by being a reason somebody buys rather than a detail they read after
   * deciding: "Everything in Silver" is true, but nobody scanning the Gold card reads it as
   * "and I can publish a verified record", and that is a feature people choose a plan for.
   */
  repeat?: boolean;
}

/**
 * Everything a plan includes, before anything is credited to the plan below it.
 *
 * Not what the card shows — featureLines() is. This is the full truth about a tier, which is
 * what the card needs in order to work out which parts of it are actually new.
 */
function allFeatureLines(tier: Tier): FeatureLine[] {
  const l = limitsFor(tier);
  const lines: FeatureLine[] = [];

  if (tier === 'free') {
    lines.push(
      { text: 'Unlimited manual trade logging' },
      { text: 'P&L calendar and dashboard stats' },
      { text: 'Notes, tags and grading' },
      { text: journalsLabel(l) },
      { text: 'Year-end realized P&L export for your accountant' },
    );
    return lines;
  }

  lines.push({ text: brokersLabel(l) });
  lines.push({ text: journalsLabel(l) });
  lines.push({ text: syncsLabel(l) });
  // True of broker import and not of manual entry, so it earns its place on every paid card —
  // and it stops Silver reading as three thin bullets next to Gold's five.
  lines.push({ text: 'Round-trip trades matched for you' });
  if (l.performanceAnalytics) {
    /* Named after what the screen actually draws from an import, not after the panels that need
       hand-entered fields. The old line — "time of day, setups, expectancy, excursions" — listed
       four things a Schwab feed cannot fill in, which is a pricing card selling the empty half. */
    lines.push({
      text: 'Performance screen — the win rate you need, position sizing, tilt, costs',
    });
  }
  if (l.aiMessagesPerDay > 0) {
    lines.push({ text: `AI trade analysis — ${l.aiMessagesPerDay} messages per day` });
  }
  if (l.ruleSimulator) {
    lines.push({ text: 'Rule simulator — what a daily stop would have done to your own year' });
  }
  if (l.trackRecord) {
    lines.push({
      text: 'Publish a verified track record — broker-imported trades only',
      repeat: true,
    });
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

/**
 * What each plan lists on the pricing page. Kept beside the limits so they can't disagree.
 *
 * A paid card opens with "Everything in <the plan below>" and then lists only what that plan
 * does not already give you. Repeating the inherited lines underneath that sentence — which is
 * what this used to do — made Diamond thirteen bullets deep, most of them things the reader had
 * already agreed to two cards ago, and buried the four lines that actually justify the price.
 *
 * A line marked repeat is the exception and is printed anyway — see FeatureLine.repeat.
 *
 * Matched on the rendered text, not on the limit behind it, because that is exactly the
 * distinction a reader makes: "5 broker connections" and "10 broker connections" are different
 * sentences and both belong, while "Round-trip trades matched for you" is the same sentence
 * twice and the second one is noise.
 */
export function featureLines(tier: Tier): FeatureLine[] {
  const below = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
  if (!below) return allFeatureLines(tier);

  const inherited = new Set(allFeatureLines(below).map((line) => line.text));
  return [
    { text: `Everything in ${TIER_PLANS[below].name}` },
    ...allFeatureLines(tier).filter((line) => line.repeat || !inherited.has(line.text)),
  ];
}
