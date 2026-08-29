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
    title: 'Ask questions about your own trading',
    description:
      'A new panel on your dashboard reviews the period with you. It opens with questions drawn from your actual data \u2014 your worst setup, your weakest time of day \u2014 and you can ask follow-ups in your own words. Every number it quotes is computed by the app first, so it can\u2019t contradict your dashboard, and it reviews what already happened rather than telling you what to trade next.',
  },
  {
    date: 'August 2026',
    title: 'Broker sync now runs on its own',
    description:
      'Until now, syncing only happened when you opened Connect Broker and tapped the button \u2014 so trades from the week were sitting there waiting for you to go fetch them. Opening your journal now refreshes your connected brokers by itself, at most once every few hours, and a small line beside the Month/Year toggle tells you when it last ran and how many trades came in. Tap it to sync on demand.',
  },
  {
    date: 'August 2026',
    title: 'The mobile app got a real navigation bar',
    description:
      'The bar at the bottom of your phone now holds actual destinations \u2014 Overview, Ranks, Settings and More \u2014 highlights the one you\u2019re on, and stays put when you move between them instead of vanishing. Log Trade keeps the middle. Sign out moved into the More menu, where it can\u2019t be hit by mistake reaching for the plus button. The header slimmed down and the broker banner is much shorter on a phone, so your P&L is visible the moment the journal opens.',
  },
  {
    date: 'August 2026',
    title: 'Share cards: sharper, logo fixed, and Share sends the image',
    description:
      'Cards now export at full resolution \u2014 1080\u00d71920 for the phone format, which is exactly the size a story slot wants, so nothing gets blown up and softened on the way in. Two bugs fixed alongside it. The logo was missing from every downloaded card \u2014 the export renders the card through a blob URL, where the logo\u2019s relative path had nothing to resolve against, so it silently never loaded. And the Share button was sending a line of text instead of the card itself; it now shares the actual image with the stats as its caption. The card was redesigned too: your three stats sit in one row under a win/loss bar instead of three stacked boxes.',
  },
  {
    date: 'August 2026',
    title: 'Broker sync status is now tracked properly',
    description:
      'Behind the scenes, whether your brokerage is actually linked is now recorded when your connection is checked, instead of being re-derived every time. Nothing changes in how you connect \u2014 it just means the site owner can see which brokers people actually use, and spot a broker whose setup flow is failing.',
  },
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
