export interface GuideArticle {
  slug: string;
  title: string;
  description: string;
  path: string;
  sections: { heading: string; paragraphs: string[] }[];
}

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    slug: 'free-trading-journal',
    title: 'Free Trading Journal for Active Traders',
    description:
      'Why a free trading journal helps you track performance, review mistakes, and improve consistency — without spreadsheets or broker logins.',
    path: '/guides/free-trading-journal',
    sections: [
      {
        heading: 'What makes a good free trading journal?',
        paragraphs: [
          'A trading journal should show your results clearly — not bury them in rows. Trend Chasers is built around a visual P&L calendar so green and red days stand out immediately.',
          'You get net P&L, win rate, profit factor, and average profit per trade without exporting to another tool. Import trades from your brokerage via screenshot or CSV, or log them manually.',
        ],
      },
      {
        heading: 'Why traders switch from spreadsheets',
        paragraphs: [
          'Spreadsheets work until you skip a week, mis-tag a setup, or lose track of which account a trade belongs to. A dedicated journal keeps daily P&L, tags, and notes tied to each session.',
          'Trend Chasers is free to start. Optional sign-in syncs your journal across devices — your brokerage login is never required.',
        ],
      },
    ],
  },
  {
    slug: 'trading-journal-without-broker-login',
    title: 'Trading Journal Without Broker Login',
    description:
      'Track trades safely without connecting your brokerage. Import CSV or screenshots manually — your login stays separate from your journal.',
    path: '/guides/trading-journal-without-broker-login',
    sections: [
      {
        heading: 'Your brokerage and your journal should stay separate',
        paragraphs: [
          'Many tools ask for API keys or OAuth access to your brokerage. Trend Chasers never does. You control what enters the journal: a CSV export, a screenshot from your app, or manual entry.',
          'That means no third party holds your brokerage credentials, and you can journal even if your broker does not offer API access.',
        ],
      },
      {
        heading: 'How to import without connecting',
        paragraphs: [
          'Upload a screenshot of your positions or P/L screen — AI extracts symbols and daily P/L for review before saving.',
          'Drop in a CSV statement export and match round-trip trades in seconds. Everything stays under your Trend Chasers account, not your broker.',
        ],
      },
    ],
  },
  {
    slug: 'pnl-calendar-trading-journal',
    title: 'P&L Calendar Trading Journal',
    description:
      'Review performance day by day on a color-coded calendar. See winning streaks, red days, and monthly net P&L at a glance.',
    path: '/guides/pnl-calendar-trading-journal',
    sections: [
      {
        heading: 'Why a P&L calendar beats a flat trade list',
        paragraphs: [
          'Lists hide patterns. A calendar shows whether you are green on Tuesdays, bleeding on FOMO days, or improving week over week.',
          'Trend Chasers colors each day by net P&L. Click a day to import that session or drill into individual trades.',
        ],
      },
      {
        heading: 'Turn daily results into better decisions',
        paragraphs: [
          'Pair the calendar with setup tags and notes to see which strategies actually pay. Export month reports when you need a snapshot for taxes or coaching.',
          'Performance analytics — win rate, profit factor, weekday breakdown — sit on top of the same calendar data so you are never reconciling two views.',
        ],
      },
    ],
  },
];

export function getGuideBySlug(slug: string): GuideArticle | undefined {
  return GUIDE_ARTICLES.find((guide) => guide.slug === slug);
}
