/**
 * The only things that genuinely differ between one broker's guide and another's.
 *
 * Everything else — how you connect, what syncs, what the connection can and cannot do, what it
 * costs — is a fact about this app, identical for all twenty, and is written once in the template
 * rather than twenty times here. That split is deliberate: the three hand-written guides that
 * existed before this both told readers "both are free" long after broker sync became a paid
 * feature, because the claim was typed into each page instead of derived from the thing it was
 * describing.
 *
 * Blurbs stay at the level a description stays true for years. Ownership, fee schedules and
 * platform features change, and a marketing page nobody revisits is exactly where a stale claim
 * survives longest.
 */
export interface BrokerGuideNote {
  /** One clause completing "…, <blurb>." Used in the intro. */
  blurb: string;
  /** Set when the broker does not trade equities and options, so the copy does not imply it does. */
  assetClass?: 'crypto';
  /** Displayed name of the broker whose connection this one rides on. */
  connectsVia?: string;
  /** An extra, genuinely broker-specific paragraph. */
  note?: string;
  /**
   * Overrides the registry's brokerId as the URL slug.
   *
   * Only for guides that already existed at a different address. /brokers/charles-schwab is
   * indexed; deriving the slug from the registry would have moved it to /brokers/schwab and turned
   * a ranking page into a 404 with no redirect behind it.
   */
  slug?: string;
}

export const BROKER_GUIDE_NOTES: Record<string, BrokerGuideNote> = {
  SCHWAB: {
    slug: 'charles-schwab',
    blurb: 'a full-service brokerage, and the home of thinkorswim',
    note:
      'Thinkorswim accounts are Schwab accounts, so one Schwab connection covers your thinkorswim '
      + 'activity as well — there is no separate thinkorswim connection to make.',
  },
  ROBINHOOD: { blurb: 'a mobile-first, commission-free brokerage' },
  WEBULL: { blurb: 'a commission-free trading app popular with active traders' },
  FIDELITY: { blurb: 'a full-service brokerage' },
  ETRADE: { blurb: 'a long-established online brokerage' },
  INTERACTIVE_BROKERS: { blurb: 'a brokerage built for active and professional traders' },
  VANGUARD: {
    blurb: 'primarily a long-term investing platform',
    note:
      'Vanguard accounts tend to hold positions for months or years rather than round-tripping '
      + 'them intraday. A journal is still useful — it is just recording decisions and their '
      + 'outcomes over a longer horizon than a day trader would.',
  },
  TASTYTRADE: { blurb: 'an options-focused brokerage' },
  TRADESTATION: { blurb: 'a platform aimed at active traders' },
  TRADIER: { blurb: 'an API-friendly brokerage, often used behind a third-party front-end' },
  PUBLIC: { blurb: 'a mobile investing app' },
  ALPACA: {
    blurb: 'an API-first brokerage used for automated strategies',
    note:
      'If your fills come from a bot rather than your own hands, a journal is where you find out '
      + 'which of its rules actually earn their keep — the sync brings the fills in and the tags '
      + 'and notes are yours to add.',
  },
  MOOMOO: { blurb: 'a commission-free trading app' },
  CHASE: { blurb: 'self-directed investing alongside Chase banking' },
  CITI: { blurb: 'self-directed investing alongside Citi banking' },
  EDWARD_JONES: { blurb: 'a full-service advisory firm' },
  COINBASE: {
    blurb: 'a cryptocurrency exchange',
    assetClass: 'crypto',
    note:
      'Coinbase is crypto rather than equities, so there are no options contracts, no expirations '
      + 'and no market close. The journal treats a crypto round trip the same as any other: an '
      + 'open, a close, and what happened in between.',
  },
  TIAA: { blurb: 'a retirement-focused provider' },
  PNC: { blurb: 'a wealth-management platform' },
};

export const THINKORSWIM_NOTE: BrokerGuideNote = {
  blurb: "Charles Schwab's active-trading platform",
  connectsVia: 'Charles Schwab',
  note:
    'Thinkorswim runs on Schwab infrastructure, so there is no separate thinkorswim connection. '
    + 'Connect Charles Schwab and your thinkorswim activity comes with it.',
};
