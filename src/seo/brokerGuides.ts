import { BROKER_REGISTRY, THINKORSWIM_DISPLAY, type BrokerRegistryEntry } from '../data/brokerRegistry';
import { TIER_PLANS } from '../config/tiers';
import { BROKER_GUIDE_NOTES, THINKORSWIM_NOTE, type BrokerGuideNote } from './brokerGuideNotes';

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

/**
 * One guide per supported broker, built from the registry.
 *
 * There were three of these, hand-written, for twenty brokers — so seventeen brokers a trader could
 * actually connect had no page telling them how, and no page for anyone searching their broker's
 * name. Writing seventeen more by hand would have reproduced the problem that made the existing
 * three wrong: two of them promised broker sync was free, which stopped being true the day tiers
 * shipped, because the claim was typed into the page rather than read from the plans.
 *
 * So the shared substance — the connect flow, what the connection can do, what it costs — is
 * written once and derived where it can be. Adding a broker to the registry now adds its guide.
 */

const SILVER = TIER_PLANS.silver;

function priceSentence(): string {
  return (
    `Broker sync is a paid feature — ${SILVER.name} is $${SILVER.price} a month and connects `
    + `${SILVER.limits.brokers === 1 ? 'one broker' : `${SILVER.limits.brokers} brokers`}. `
    + 'Journaling by hand is free and always will be: the calendar, tags, notes, screenshots and '
    + 'stats are all in the free plan.'
  );
}

function connectName(name: string, note: BrokerGuideNote): string {
  return note.connectsVia ?? name;
}

function buildGuide(name: string, brokerId: string, note: BrokerGuideNote, status?: BrokerRegistryEntry['status']): BrokerGuide {
  const via = connectName(name, note);
  const isCrypto = note.assetClass === 'crypto';
  const fills = isCrypto ? 'trades' : 'fills';

  const syncParagraphs = [
    `Open Connect broker in the sidebar, pick ${via}, and approve a read-only connection. The `
    + `login happens on ${via}'s own page through SnapTrade, a broker-data provider — your password `
    + 'is never typed into Trend Chasers and never reaches it.',
    `Press Sync and your ${fills} come across. Opens are matched to closes into round-trip trades `
    + 'with the P&L worked out per trade, fees included where the brokerage reports them, and they '
    + 'land on the calendar ready to tag and annotate.',
  ];
  if (note.note) syncParagraphs.push(note.note);

  const statusParagraph = status?.kind === 'down'
    ? [{
        heading: `${name} connections are paused right now`,
        paragraphs: [
          // The registry message already says what still works; repeating it here read as filler.
          status.message,
        ],
      }]
    : [];

  const sections = [
    ...statusParagraph,
    { heading: `Sync your ${name} trades`, paragraphs: syncParagraphs },
    {
      heading: 'Or log them by hand',
      paragraphs: [
        'Log trade takes a symbol, a P&L, a side and a setup tag, and that is a journal entry. Most '
        + 'people who log manually do it at the end of the session from their own P/L screen.',
        'The two mix: sync one account and hand-log a second broker, a prop account or a paper '
        + 'account in the same journal.',
      ],
    },
    {
      heading: `Why journal ${name} trades separately`,
      paragraphs: [
        `${name} tells you what your account is worth. It does not tell you which setup is `
        + 'actually paying, what time of day you give money back, or whether the rule you broke on '
        + 'Tuesday is the one costing you the most. That is what a journal is for: tags, notes, '
        + 'screenshots, and a calendar where a losing streak is visible at a glance.',
        'The connection is read-only: it can read your trade history, and it cannot place an order, '
        + 'move money, or change a setting. Disconnect whenever you like — the trades already '
        + 'imported stay in your journal.',
      ],
    },
  ];

  const faq = [
    {
      question: `Do I have to connect my ${name} account?`,
      answer:
        'No. Manual entry is a first-class way to use this — plenty of people prefer keeping their '
        + 'journal and their brokerage entirely separate, and nothing is withheld if you do.',
    },
    {
      question: 'What does it cost?',
      answer: priceSentence(),
    },
    {
      question: `Can Trend Chasers trade my ${name} account?`,
      answer:
        'No. The connection is read-only, so it can import your trade history and nothing else — '
        + 'it cannot place orders, move money, or change a setting. You can revoke it at any time.',
    },
    ...(isCrypto
      ? []
      : [{
          question: 'Does it handle options?',
          answer:
            'Yes. Options fills come in with strike, expiration and contract details when the '
            + 'brokerage reports them, and round-trip matching pairs opens with closes.',
        }]),
  ];

  return {
    slug: brokerId,
    brokerName: name,
    title: `${name} Trading Journal — Broker Sync or Manual Entry`,
    description:
      `Journal your ${name} trades on a P&L calendar. Import them through a secure read-only `
      + 'connection, or log them by hand for free.',
    path: `/brokers/${brokerId}`,
    intro:
      `${name} is ${note.blurb}. Trend Chasers turns its activity into a trading journal — a P&L `
      + 'calendar, setup tags, notes and stats — either by syncing it read-only or by logging '
      + 'trades yourself.',
    sections,
    faq,
  };
}

export const BROKER_GUIDES: BrokerGuide[] = [
  buildGuide(THINKORSWIM_DISPLAY.name, THINKORSWIM_DISPLAY.brokerId, THINKORSWIM_NOTE),
  ...BROKER_REGISTRY.map((entry) =>
    buildGuide(
      entry.name,
      BROKER_GUIDE_NOTES[entry.key]?.slug ?? entry.brokerId,
      // A broker with no note still gets a guide. A missing entry here should mean plainer copy,
      // never a broker that silently has no page.
      BROKER_GUIDE_NOTES[entry.key] ?? { blurb: 'a supported brokerage' },
      entry.status,
    ),
  ),
];

export function getBrokerGuideBySlug(slug: string): BrokerGuide | undefined {
  return BROKER_GUIDES.find((guide) => guide.slug === slug);
}

/** Every broker guide path, for the sitemap and the prerender list. */
export const BROKER_GUIDE_PATHS: string[] = BROKER_GUIDES.map((g) => g.path);
