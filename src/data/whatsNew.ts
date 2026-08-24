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
    title: 'Broker sync',
    description:
      'Connect thinkorswim, Charles Schwab, Robinhood, or Webull and your trades import automatically — no more manual entry. Your P&L calendar and stats update as new trades come in.',
  },
];
