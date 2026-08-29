export interface ChangelogEntry {
  /** e.g. "August 2026" — month-level precision is enough for a product changelog. */
  date: string;
  title: string;
  description: string;
}

// Add new entries to the TOP of this array as real updates ship — newest first.
// Keep it to updates a user would actually notice (new features, broker support,
// major fixes), not every commit.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: 'August 2026',
    title: 'The dashboard now tells you what to fix',
    description:
      'A new line at the top of your dashboard names the single biggest thing costing you money this period \u2014 a setup that keeps bleeding, a part of the day you should stop trading, or winners you\u2019re exiting too early. Below it, a full equity curve with your drawdown shaded in, so you can see the ride and not just the result.',
  },
  {
    date: 'August 2026',
    title: 'Execution and timing analytics',
    description:
      'If you log MAE, MFE or R-multiple on your trades, the dashboard now analyses them: what percentage of each winner\u2019s peak you actually banked, how much heat you take on losers versus winners, and how many trades were green before they closed red. There\u2019s also a new breakdown of P&L by time of day \u2014 premarket, the open, midday and the close.',
  },
  {
    date: 'August 2026',
    title: 'Metrics that tell you if they\u2019re good',
    description:
      'Profit factor, expectancy and drawdown now come with a plain-language read instead of a bare number. Win rate is judged against the rate your own average win and loss actually require to break even \u2014 so a 45% win rate with big winners reads as healthy, which it is. Add your trading capital in Settings and you\u2019ll also see your return next to SPY\u2019s.',
  },
  {
    date: 'August 2026',
    title: 'Share cards got a redesign',
    description:
      'Your session/month/year share card now has a denser Milky Way background that matches your theme accent, and rounded corners that export as real transparency in the downloaded PNG. You can also upload your own photo as the card background instead — it\'s saved to your account, so next time you can just pick it from your saved photos instead of uploading again.',
  },
  {
    date: 'August 2026',
    title: 'Public leaderboard is live',
    description:
      'See how you stack up — ranked by profit, consistency, or risk management, with a Day / Week / Month / All-time filter. It\'s opt-in: nobody appears until they turn on "Show me on the public leaderboard" in Settings, and only broker-synced trades ever count toward a ranking.',
  },
  {
    date: 'August 2026',
    title: 'Broker sync expanded to 20 brokers',
    description:
      'Broker sync now covers 20 brokers — Fidelity, Interactive Brokers, E*TRADE, Vanguard, tastytrade, TradeStation, Tradier, Public, Alpaca, Moomoo, Chase, Citi, Edward Jones, Coinbase, TIAA, and PNC Wealth Management join thinkorswim, Schwab, Robinhood, and Webull. Same read-only connection via SnapTrade — connect, sync, disconnect anytime.',
  },
  {
    date: 'August 2026',
    title: 'Broker sync',
    description:
      'Connect thinkorswim, Charles Schwab, Robinhood, or Webull and your trades import automatically — no more manual entry. Your P&L calendar and stats update as new trades come in.',
  },
];
