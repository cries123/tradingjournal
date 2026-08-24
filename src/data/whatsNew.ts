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
