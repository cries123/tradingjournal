export interface FaqItem {
  question: string;
  answer: string;
}

export const LANDING_FAQ: FaqItem[] = [
  {
    question: 'Do I need to log in to my broker?',
    answer:
      'Never. Trend Chasers never connects to your brokerage account. You upload CSV files, screenshots, or enter trades manually — completely separate from your broker login.',
  },
  {
    question: 'Which brokers are supported today?',
    answer:
      'Thinkorswim, Charles Schwab, and Robinhood have dedicated import guides. AI screenshot parsing works across mobile brokerage apps, and CSV import handles Schwab and Thinkorswim statement exports.',
  },
  {
    question: 'I use a different broker. Can you add support?',
    answer:
      'Yes — use Request broker support in the footer. Tell us your broker and how you export trades; we can configure import support for your workflow.',
  },
  {
    question: 'Can I use Trend Chasers on my phone?',
    answer:
      'Yes. The journal is built mobile-first — log trades, snap screenshots for AI import, and review your calendar from your phone. Use Add to Home Screen to install it like an app.',
  },
  {
    question: 'Does it work for options, futures, and crypto?',
    answer:
      'Yes. Options imports capture strikes, expirations, and Greeks when visible. Manual entry supports stocks, options, futures, forex, and crypto with per-trade tags and notes.',
  },
  {
    question: 'Is my trade data secure?',
    answer:
      'Without an account, your journal never leaves your browser. With an account, trades sync encrypted in transit and only your login can read them. Broker credentials are never collected — there is nothing to leak.',
  },
  {
    question: 'How accurate is AI import?',
    answer:
      'AI is a starting point — always review parsed trades before saving. You can edit P/L, flip signs, and deselect rows before importing.',
  },
  {
    question: 'Is Trend Chasers a free trading journal?',
    answer:
      'Yes. Trend Chasers is a free trading journal with a P&L calendar, performance analytics, and optional cloud sync. No credit card required.',
  },
];
