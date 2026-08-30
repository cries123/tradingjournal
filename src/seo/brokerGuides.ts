export interface BrokerGuide {
  slug: string;
  brokerName: string;
  title: string;
  description: string;
  path: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  faq: { question: string; answer: string }[];
}

export const BROKER_GUIDES: BrokerGuide[] = [
  {
    slug: 'thinkorswim',
    brokerName: 'Thinkorswim',
    title: 'Thinkorswim Trading Journal — Automatic Sync or Manual Entry',
    description:
      'Journal Thinkorswim trades with a P&L calendar. Connect your Schwab account and import trades in one tap, or log them manually.',
    path: '/brokers/thinkorswim',
    intro:
      'Track your Thinkorswim trades on a visual P&L calendar. Thinkorswim accounts are Schwab accounts, so connecting Schwab through Trend Chasers syncs your Thinkorswim activity too — or log sessions manually if you\'d rather not connect anything.',
    sections: [
      {
        heading: 'Sync Thinkorswim trades automatically',
        paragraphs: [
          'From Connect broker in the sidebar, choose Charles Schwab and approve a read-only connection through SnapTrade, a broker-data connection provider. Because thinkorswim runs on Schwab\'s infrastructure, this covers both.',
          'Round-trip trades are matched automatically — opens paired with closes, P&L computed per trade — and land on your calendar ready to review, tag, and annotate.',
        ],
      },
      {
        heading: 'Or log sessions manually',
        paragraphs: [
          'Prefer not to connect anything? Log trade lets you enter symbol, P&L, side, and setup tags in seconds. Many traders log end-of-day from memory or a quick glance at their P/L screen.',
          'You can mix both: sync one account automatically and log a paper account or a second broker by hand.',
        ],
      },
      {
        heading: 'Why traders journal Thinkorswim trades separately',
        paragraphs: [
          'Thinkorswim shows account performance, but it is not a journal. A dedicated journal adds setup tags, notes, chart screenshots, win-rate analytics, and a calendar view that makes green and red streaks obvious.',
          'Broker sync is read-only and optional — your Schwab login goes to Schwab or SnapTrade\'s secure portal, never to Trend Chasers, and you can disconnect at any time.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need to connect my Schwab or Thinkorswim account?',
        answer:
          'No. Connecting is optional — Connect broker in the sidebar syncs trades automatically if you want it, but manual entry works just as well if you\'d rather not link anything.',
      },
      {
        question: 'Does broker sync handle options trades?',
        answer:
          'Yes. Options fills sync with strike, expiration, and contract details when the brokerage provides them, and round-trip matching pairs opens with closes.',
      },
      {
        question: 'Is this free for Thinkorswim traders?',
        answer:
          'Yes. Trend Chasers is a free trading journal. Optional sign-in adds cloud sync across devices.',
      },
    ],
  },
  {
    slug: 'charles-schwab',
    brokerName: 'Charles Schwab',
    title: 'Charles Schwab Trading Journal — Automatic Sync or Manual Entry',
    description:
      'Journal Charles Schwab trades on a P&L calendar. Import through a secure, read-only connection, or log trades manually.',
    path: '/brokers/charles-schwab',
    intro:
      'Turn your Schwab account activity into a visual trading journal. Connect once and import whenever you want, or keep full manual control — both are free.',
    sections: [
      {
        heading: 'Connect Schwab and import your trades',
        paragraphs: [
          'Open Connect broker from the sidebar, choose Charles Schwab, and approve a connection through SnapTrade — a broker-data connection provider that handles the secure link on Schwab\'s own site. Trend Chasers never sees your Schwab password.',
          'Once connected, Trend Chasers reads your recent activity, matches round-trip trades, and computes P&L per position automatically. Sync again anytime to pull in new activity.',
        ],
      },
      {
        heading: 'Read-only, and easy to undo',
        paragraphs: [
          'The connection is read-only by default — it can pull your trade history, but nothing can place trades on your behalf. Disconnect from Connect broker at any time to revoke access immediately.',
          'If you\'d rather not connect at all, Log trade covers manual entry with the same tags, notes, and analytics.',
        ],
      },
      {
        heading: 'Keep accounts separate',
        paragraphs: [
          'Track multiple Schwab accounts, or a live account alongside a paper account, using the multi-journal feature — each keeps its own trades, stats, and calendar.',
        ],
      },
    ],
    faq: [
      {
        question: 'How does Schwab sync actually work?',
        answer:
          'Trend Chasers uses SnapTrade to connect to Schwab. You authorize the connection on Schwab\'s or SnapTrade\'s site; your credentials are never sent to or stored by Trend Chasers.',
      },
      {
        question: 'Will Trend Chasers ever ask for my Schwab password directly?',
        answer:
          'No. Authorization happens on Schwab\'s or SnapTrade\'s own site. Trend Chasers only receives read access to your trade data after you approve it.',
      },
      {
        question: 'Can I track multiple Schwab accounts?',
        answer:
          'Yes. Create a journal per account and switch between them — each keeps its own trades, stats, and calendar.',
      },
    ],
  },
  {
    slug: 'robinhood',
    brokerName: 'Robinhood',
    title: 'Robinhood Trading Journal — Automatic Sync or Manual Entry',
    description:
      'Journal Robinhood trades on a visual P&L calendar. Import through a read-only connection, or log trades manually.',
    path: '/brokers/robinhood',
    intro:
      'Robinhood shows you today\'s P/L and little else. Journal your trades on a calendar, tag your setups, and see your real win rate — connect and import your fills, or log sessions yourself.',
    sections: [
      {
        heading: 'Connect Robinhood and import your trades',
        paragraphs: [
          'Robinhood doesn\'t offer a public trading API, so Trend Chasers connects through SnapTrade, a broker-data connection provider that brokers a secure, read-only link to your account. Open Connect broker in the sidebar to get started.',
          'Once connected, your trade history syncs in and round-trip trades are matched automatically — buys paired with sells, P&L computed per trade.',
        ],
      },
      {
        heading: 'Read-only, disconnect anytime',
        paragraphs: [
          'The connection can only read your activity — it cannot place trades. Your Robinhood login goes to Robinhood or SnapTrade\'s secure portal, never to Trend Chasers, and you can disconnect from Connect broker at any time.',
          'If you\'d rather not connect, Log trade covers manual entry in a few seconds per session.',
        ],
      },
      {
        heading: 'See what Robinhood does not show you',
        paragraphs: [
          'Robinhood is built for placing trades, not reviewing them. A journal shows your win rate, profit factor, expectancy per trade, weekday performance, and losing streaks before they get expensive.',
          'The P&L calendar makes patterns obvious: revenge-trading Mondays, oversized Friday losses, or the setup tag that quietly loses money every week.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does Robinhood have an official trading API?',
        answer:
          'Not a public one for stocks and options. Trend Chasers connects through SnapTrade, which brokers a secure, read-only link to your account so you don\'t have to export or screenshot anything.',
      },
      {
        question: 'Is the Robinhood connection safe?',
        answer:
          'It\'s read-only and your credentials are never sent to Trend Chasers — they go to Robinhood or SnapTrade\'s secure connection portal. Disconnect anytime to revoke access.',
      },
      {
        question: 'Do I have to connect my Robinhood account?',
        answer:
          'No. Manual entry is always available if you\'d rather keep your journal and your brokerage completely separate.',
      },
    ],
  },
];

export function getBrokerGuideBySlug(slug: string): BrokerGuide | undefined {
  return BROKER_GUIDES.find((guide) => guide.slug === slug);
}
