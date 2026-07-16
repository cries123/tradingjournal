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
    title: 'Thinkorswim Trading Journal — Import Trades Without Linking Your Account',
    description:
      'Journal Thinkorswim trades with a P&L calendar. Import via CSV export or AI screenshot parsing — no account linking, no API keys, no broker login.',
    path: '/brokers/thinkorswim',
    intro:
      'Track your Thinkorswim trades on a visual P&L calendar without ever connecting your Schwab login. Export a CSV or snap a screenshot — your credentials stay with your broker.',
    sections: [
      {
        heading: 'Import Thinkorswim trades from a CSV export',
        paragraphs: [
          'In Thinkorswim desktop, open the Monitor tab and go to Account Statement. Set your date range, right-click the Account Trade History section, and export to file. That CSV contains every execution with time, side, quantity, and price.',
          'Drop the file into Trend Chasers and round-trip trades are matched automatically — opens paired with closes, P&L computed per trade. Review the parsed list, deselect anything you do not want, and import to your calendar.',
        ],
      },
      {
        heading: 'Or screenshot your positions — AI does the parsing',
        paragraphs: [
          'For quick end-of-day logging, screenshot the P/L or positions screen in the Thinkorswim mobile app. The AI import reads symbols, daily P/L, and options details like strikes and expirations when visible.',
          'You always review before saving: flip P/L signs, fix symbols, or drop rows. Nothing enters your journal without your approval.',
        ],
      },
      {
        heading: 'Why traders journal Thinkorswim trades separately',
        paragraphs: [
          'Thinkorswim shows account performance, but it is not a journal. A dedicated journal adds setup tags, notes, screenshots of your charts, win-rate analytics, and a calendar view that makes green and red streaks obvious.',
          'Because Trend Chasers never asks for your Schwab login, you can journal a live account, a paper account, or both — completely separated from your brokerage access.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need to link my Schwab or Thinkorswim account?',
        answer:
          'No. Trend Chasers never connects to your brokerage. You import trades yourself via CSV export or screenshot — your login stays with your broker.',
      },
      {
        question: 'Does the CSV import handle options trades?',
        answer:
          'Yes. The Thinkorswim Account Trade History export includes options executions, and round-trip matching pairs opens with closes including multi-leg fills.',
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
    title: 'Charles Schwab Trading Journal — CSV Import, No Broker Login',
    description:
      'Journal Charles Schwab trades on a P&L calendar. Import account statement CSVs or screenshots — no OAuth, no API keys, no credentials shared.',
    path: '/brokers/charles-schwab',
    intro:
      'Turn your Schwab account statements into a visual trading journal. Import the CSV you already export for your records — your Schwab login never leaves your broker.',
    sections: [
      {
        heading: 'Import your Schwab account statement CSV',
        paragraphs: [
          'From Schwab.com, open Accounts → History, choose your date range, and export transactions as CSV. Trend Chasers parses the statement, matches round-trip trades, and computes P&L per position.',
          'The importer is optimized for Schwab statement exports: it skips non-trade rows like dividends and transfers, and pairs buys with sells automatically for review before anything is saved.',
        ],
      },
      {
        heading: 'Screenshot import for quick daily logging',
        paragraphs: [
          'Do not want to export a file every day? Screenshot your positions or realized P/L screen in the Schwab mobile app. AI extracts symbols and P/L for one-tap review and import.',
          'This works well for end-of-day journaling: log the session in under a minute, add setup tags and notes while the trades are fresh.',
        ],
      },
      {
        heading: 'Your Schwab credentials stay with Schwab',
        paragraphs: [
          'Many journaling tools ask you to link your brokerage with OAuth or hand over API keys. Trend Chasers never does — there is nothing to link, revoke, or worry about.',
          'You control exactly what enters the journal, which also means you can keep separate journals per account using the multi-journal feature.',
        ],
      },
    ],
    faq: [
      {
        question: 'Which Schwab export does the CSV import expect?',
        answer:
          'The transactions/history CSV export from Schwab.com. Thinkorswim Account Statement exports are also supported — see the Thinkorswim guide.',
      },
      {
        question: 'Will Trend Chasers ever ask for my Schwab password?',
        answer:
          'Never. There is no account linking of any kind. You export data from Schwab yourself and import it manually.',
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
    title: 'Robinhood Trading Journal — Screenshot & CSV Import, No Login Linking',
    description:
      'Journal Robinhood trades on a visual P&L calendar. Import your activity report CSV or screenshots — no account linking required.',
    path: '/brokers/robinhood',
    intro:
      'Robinhood shows you today’s P/L and little else. Journal your trades on a calendar, tag your setups, and see your real win rate — without linking your Robinhood account.',
    sections: [
      {
        heading: 'Import from your Robinhood activity report',
        paragraphs: [
          'In the Robinhood app, go to Account → Statements & History → Reports and generate an activity report CSV. It lists every fill with date, instrument, quantity, and amount.',
          'Trend Chasers reads the report, matches buys to sells into round-trip trades, and computes per-trade P&L. Review the parsed trades and import the ones you want on your calendar.',
        ],
      },
      {
        heading: 'Screenshot your P/L for instant logging',
        paragraphs: [
          'Screenshot your positions or closed P/L screen and let AI extract the numbers — symbols, daily P/L, and options contract details when visible.',
          'Everything lands in a review screen first. Fix a sign, correct a ticker, deselect a row — then import. Ideal for logging a session in seconds from your phone.',
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
        question: 'Do I have to connect my Robinhood account?',
        answer:
          'No. Trend Chasers never asks for your Robinhood login. Import happens through CSV reports or screenshots that you control.',
      },
      {
        question: 'Does it work with Robinhood options trades?',
        answer:
          'Yes. Both the activity report import and AI screenshot parsing handle options, including strikes and expirations when visible.',
      },
      {
        question: 'Is Trend Chasers really free?',
        answer:
          'Yes — the journal, calendar, imports, and analytics are free. Optional sign-in syncs your journal across devices.',
      },
    ],
  },
];

export function getBrokerGuideBySlug(slug: string): BrokerGuide | undefined {
  return BROKER_GUIDES.find((guide) => guide.slug === slug);
}
