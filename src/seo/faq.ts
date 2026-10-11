import { BROKER_REGISTRY, THINKORSWIM_DISPLAY } from '../data/brokerRegistry';
import { freeAnswer } from './pricingClaims';

export interface FaqItem {
  question: string;
  answer: string;
}

const SUPPORTED_BROKER_COUNT = BROKER_REGISTRY.length + 1; // +1 for thinkorswim (rides on Schwab)
const SUPPORTED_BROKER_NAMES = [THINKORSWIM_DISPLAY.name, ...BROKER_REGISTRY.map((b) => b.name)];

export const LANDING_FAQ: FaqItem[] = [
  {
    question: 'Do I have to connect my broker?',
    answer:
      'No. Connecting a broker is entirely optional — you can log every trade manually and never connect anything.',
  },
  {
    question: 'How does broker sync work?',
    answer:
      'Trend Chasers uses SnapTrade, a broker-data connection provider, to pull your trade history. Your login goes to your broker or SnapTrade\'s secure portal, never to Trend Chasers\' servers. Connections are read-only, and you can disconnect anytime from the app.',
  },
  {
    question: 'Which brokers are supported today?',
    answer:
      `${SUPPORTED_BROKER_COUNT} brokers support one-tap import, including ${SUPPORTED_BROKER_NAMES.slice(0, 6).join(', ')}, and more — see the full list on the Brokers page. Manual entry works for any broker.`,
  },
  {
    question: 'I use a different broker. Can you add support?',
    answer:
      'Manual entry works with any broker today. One-tap import arrives as SnapTrade adds brokerages; if you have an account, open a support ticket in the app and tell us which one you use.',
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
    // Built from the tier table. This answer is emitted as schema.org FAQPage markup, so a stale
    // version of it is the one Google shows — it said the free plan included performance
    // analytics and broker sync for as long as both were paid.
    answer: freeAnswer(),
  },
];
