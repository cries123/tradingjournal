export interface ChangelogEntry {
  /** e.g. "August 2026" — month-level precision is enough for a product changelog. */
  date: string;
  title: string;
  description: string;
}

// Add new entries to the TOP of this array as real updates ship — newest first.
//
// This page is for TRADERS. Every entry has to answer "what changed in my journal?" — new
// features, broker support, fixes they'd have noticed. Nothing about the admin panel, internal
// analytics, or how anything is stored or tracked behind the scenes: a trader has no admin panel
// and doesn't care that a number is now cached instead of recomputed. If an entry's real subject
// is something only the site owner can see, it doesn't belong here at all.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: 'September 2026',
    title: 'Broker sync was getting your numbers wrong \u2014 here\u2019s the fix',
    description:
      'If you imported trades from your broker, some of them were wrong, and we\u2019re sorry. Four separate problems, all in how individual fills were paired up into round trips. The entry commission was charged again on every partial exit, so scaling out of a position looked like it cost more in fees than you actually paid. On a day where your broker sends no time of day \u2014 Schwab is one \u2014 fills could be paired in the wrong order, which invented trades you never placed. Options that expired or were assigned were skipped entirely, so a contract that expired worthless never closed. And if you traded the same contract both long and short in one day, a buy to cover could close out a long position instead of the short one.\n\nAll four are fixed, and the matcher is now checked against real brokerage statements rather than against itself. A full month of trades comes out within twenty cents of the broker\u2019s own realized total, and that difference is rounding on individual rows.\n\nHere is the part that needs you. The fix applies to trades imported from now on. Anything already in your journal keeps the numbers it was imported with, and syncing again on top of it adds corrected copies alongside the old ones rather than replacing them \u2014 so please do it in this order. Open Settings and download a CSV backup of your trades. Use Clear journal in the sidebar. Then open Connect Broker and sync again. Clearing takes out trades you logged by hand as well, which is what the backup is for.',
  },
  {
    date: 'August 2026',
    title: 'Plans are here \u2014 and the journal itself stays free',
    description:
      'Trend Chasers now has paid plans, and the first thing to say is what doesn\u2019t change: logging trades by hand, the P&L calendar, every analytic on the dashboard, notes, tags, screenshots, grading and coach share links all stay free, with no trade limit. Nothing you already have has been taken away.\n\nWhat costs money is the automation. Every brokerage connection carries a monthly fee we pay whether you sync once or a hundred times, so broker sync sits behind a plan: Silver at $5 connects one brokerage with a sync a day. Gold at $10 adds a second brokerage, two syncs a day, and 15 questions a day to the assistant that reads your stats. Diamond at $25 gives you three brokerages, three syncs a day and 50 assistant messages \u2014 and market replay when it lands, which it hasn\u2019t yet; it\u2019s marked coming soon on the pricing page rather than sold as finished.\n\nYour plan, and how many syncs and assistant messages you have left today, sit at the bottom of the sidebar. Both counters reset at midnight Eastern. Every plan is month to month, cancel whenever you like and you keep it until the period you\u2019ve paid for runs out, and there\u2019s a 30-day refund with no conditions attached to it.',
  },
  {
    date: 'August 2026',
    title: 'Duplicate trades removed, and broker sync is back to manual',
    description:
      'We shipped an automatic broker sync a few days ago and got it wrong. It could run before your journal had finished loading, which meant it couldn\u2019t see the trades you already had \u2014 so it imported your broker history a second time. If your numbers doubled, that was us, not your broker and not anything you did.\n\nTwo things have happened. The automatic sync is gone: your broker is only ever contacted when you open Connect Broker and press Sync, and there is no background job of any kind. And your journal cleans itself up \u2014 next time you open it, the duplicate rows are removed and you\u2019ll see a note saying how many went. Every synced trade carries an id from your broker, so a duplicate is something we can identify exactly rather than guess at; anything you logged or wrote by hand was never a candidate and hasn\u2019t been touched, and where a trade existed twice we kept the copy with your notes, tags and screenshots on it.\n\nWe also found a second way this could have bitten you: if you had a filter active on your dashboard and pressed Sync, the check for \u201calready imported\u201d only looked at the filtered trades. That\u2019s fixed too \u2014 it now checks every trade in every one of your journals. Sorry for the mess.',
  },
  {
    date: 'August 2026',
    title: 'Ask questions about your own trading',
    description:
      'A new panel on your dashboard reviews the period with you. It opens with questions drawn from your actual data \u2014 your worst setup, your weakest time of day \u2014 and you can ask follow-ups in your own words. Every number it quotes is computed by the app first, so it can\u2019t contradict your dashboard, and it reviews what already happened rather than telling you what to trade next.',
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
