export interface FaqItem {
  question: string;
  answer: string;
}

export const LANDING_FAQ: FaqItem[] = [
  {
    question: 'Do I have to connect my broker?',
    answer:
      'No. Connecting Schwab or Robinhood for automatic sync is entirely optional — you can log every trade manually and never connect anything.',
  },
  {
    question: 'How does broker sync work?',
    answer:
      'Trend Chasers uses SnapTrade, a broker-data connection provider, to pull your trade history. Your login goes to your broker or SnapTrade\'s secure portal, never to Trend Chasers\' servers. Connections are read-only, and you can disconnect anytime from the app.',
  },
  {
    question: 'Which brokers are supported today?',
    answer:
      'Schwab (including thinkorswim accounts) and Robinhood support automatic sync. Manual entry works for any broker. Use Request broker support in the footer to ask for another connection.',
  },
  {
    question: 'I use a different broker. Can you add support?',
    answer:
      'Use Request broker support in the footer — tell us your broker and we will look at adding a connection or a manual-entry template for your workflow.',
  },
  {
    question: 'Can I use Trend Chasers on my phone?',
    answer:
      'Yes. The journal is built mobile-first — log trades, connect a broker, and review your calendar from your phone. Use Add to Home Screen to install it like an app.',
  },
  {
    question: 'Does it work for options, futures, and crypto?',
    answer:
      'Yes. Broker sync captures strikes and expirations for options where the brokerage provides them. Manual entry supports stocks, options, futures, forex, and crypto with per-trade tags and notes.',
  },
  {
    question: 'Is my trade data secure?',
    answer:
      'Without an account, your journal never leaves your browser. With an account, trades sync encrypted in transit and only your login can read them. If you connect a broker, your credentials are never stored by Trend Chasers — SnapTrade handles the connection.',
  },
  {
    question: 'Is Trend Chasers a free trading journal?',
    answer:
      'Yes. Trend Chasers is a free trading journal with a P&L calendar, performance analytics, optional broker sync, and optional cloud sync. No credit card required.',
  },
];
