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
      'Thinkorswim, Schwab, and Robinhood. AI screenshot parsing works across mobile brokerage apps. CSV import is optimized for Schwab account statements.',
  },
  {
    question: 'I use a different broker. Can you add support?',
    answer:
      'Yes — use Request broker support in the footer. Tell us your broker and how you export trades; we can configure import support for your workflow.',
  },
  {
    question: 'Is my trade data secure?',
    answer:
      'Without an account, data stays in your browser. With an account, trades sync to Firebase under your user ID. Broker credentials are never collected.',
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
