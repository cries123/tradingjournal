import { BROKER_COUNT_PHRASE, BROKER_EXAMPLES } from '../data/brokerCopy';
export interface GuideArticle {
  slug: string;
  title: string;
  description: string;
  path: string;
  sections: { heading: string; paragraphs: string[] }[];
}

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    slug: 'broker-sync-now-live',
    title: 'Broker Sync Is Live',
    description:
      `Automatic trade sync for ${BROKER_COUNT_PHRASE} is now live — read-only, so Trend Chasers never sees your balance or places trades on your behalf.`,
    path: '/guides/broker-sync-now-live',
    sections: [
      {
        heading: "What's new",
        paragraphs: [
          `You can now connect any of ${BROKER_COUNT_PHRASE} — ${BROKER_EXAMPLES} and more, with thinkorswim accounts covered by the Schwab connection — and have your round-trip trades sync straight into your calendar, no more copying numbers over by hand.`,
          'The connection is brokered by SnapTrade, a dedicated broker-data provider built for exactly this. Your login goes to your broker\'s own site or SnapTrade\'s secure portal — never to Trend Chasers.',
        ],
      },
      {
        heading: 'Read-only, on purpose',
        paragraphs: [
          'Broker sync only reads your trade history. Trend Chasers cannot see your account balance, buying power, or holdings beyond what\'s needed to reconstruct closed trades — and it cannot place, modify, or cancel a single trade on your behalf.',
          'Think of it as a one-way mirror: your trade history flows in for the journal, and nothing ever flows back out to your brokerage account.',
        ],
      },
      {
        heading: 'How to turn it on',
        paragraphs: [
          `Open Connect broker from the sidebar, choose your broker from the ${BROKER_COUNT_PHRASE} supported, and approve the read-only connection on your broker's own site. Come back, click Refresh, then Sync trades on your account — your history fills in automatically.`,
          'Nothing changes if you\'d rather not connect anything. Manual entry works exactly as it always has, and the two mix freely — sync one account, log another by hand.',
        ],
      },
      {
        heading: 'Disconnect anytime',
        paragraphs: [
          'Go to Connect broker and click Disconnect on any linked account. That revokes access immediately — the trades you already synced stay in your journal, but nothing new comes in until you reconnect.',
        ],
      },
    ],
  },
  {
    slug: 'free-trading-journal',
    title: 'Free Trading Journal for Active Traders',
    description:
      'Why a free trading journal helps you track performance, review mistakes, and improve consistency — with automatic broker sync or manual entry.',
    path: '/guides/free-trading-journal',
    sections: [
      {
        heading: 'What makes a good free trading journal?',
        paragraphs: [
          'A trading journal should show your results clearly — not bury them in rows. Trend Chasers is built around a visual P&L calendar so green and red days stand out immediately.',
          `You get net P&L, win rate, profit factor, and average profit per trade without exporting to another tool. Connect any of ${BROKER_COUNT_PHRASE} to sync trades automatically, or log them manually.`,
        ],
      },
      {
        heading: 'Why traders switch from spreadsheets',
        paragraphs: [
          'Spreadsheets work until you skip a week, mis-tag a setup, or lose track of which account a trade belongs to. A dedicated journal keeps daily P&L, tags, and notes tied to each session.',
          'Trend Chasers is free to start. Optional sign-in syncs your journal across devices, and broker sync keeps it current without any manual work.',
        ],
      },
    ],
  },
  {
    slug: 'how-broker-sync-works',
    title: 'How Broker Sync Works',
    description:
      `Connect any of ${BROKER_COUNT_PHRASE} and let trades sync automatically — how the connection works, what data it reads, and how to disconnect.`,
    path: '/guides/how-broker-sync-works',
    sections: [
      {
        heading: 'What broker sync actually does',
        paragraphs: [
          'Trend Chasers uses SnapTrade, a broker-data connection provider, to read your trade activity. You authorize the connection on your broker\'s own site or SnapTrade\'s secure portal — your credentials are never sent to or stored by Trend Chasers.',
          'Connections are read-only by default: Trend Chasers can pull your positions and trade history, but nothing can place trades on your behalf.',
        ],
      },
      {
        heading: 'Connecting is optional',
        paragraphs: [
          'You do not need to connect anything to use the journal. Manual entry works exactly as it always has, and you can mix the two — sync one account, log another by hand.',
          'If you\'d rather not link a broker at all, every feature outside of automatic sync (the calendar, analytics, tags, notes) works the same either way.',
        ],
      },
      {
        heading: 'Disconnecting',
        paragraphs: [
          'Open Connect broker from the sidebar and click Disconnect on any linked account. That revokes SnapTrade\'s access immediately — Trend Chasers keeps the trades you already synced, but nothing new comes in until you reconnect.',
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
          'Trend Chasers colors each day by net P&L. Click a day to log a trade for that session or drill into individual trades.',
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
