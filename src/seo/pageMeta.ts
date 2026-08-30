import type { AppRoute } from '../hooks/useRoute';
import { BROKER_COUNT_PHRASE, SHORT_BROKER_EXAMPLES } from '../data/brokerCopy';
import { getBrokerGuideBySlug } from './brokerGuides';
import { getGuideBySlug } from './guides';

export const SITE_ORIGIN = 'https://trendchasers.net';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

export interface PageSeo {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

const PAGE_SEO: Record<Exclude<AppRoute, 'coach' | 'guide' | 'broker-guide'>, PageSeo> = {
  landing: {
    title: 'Trend Chasers — Trading Journal & P&L Calendar',
    description:
      // Written to be the single best summary of the page, because Google was ignoring the old
      // one and lifting an FAQ answer instead. Front-loads what the product is, names the brokers
      // people search for, and says "import" rather than "automatic sync" — syncing is manual now,
      // so the old copy was promising something the app no longer does.
      `Free trading journal with a visual P&L calendar. Import from ${BROKER_COUNT_PHRASE} including Schwab and Robinhood, or log by hand. Track win rate and profit factor.`,
    path: '/',
  },
  brokers: {
    title: 'Supported Brokers — Trend Chasers Trading Journal',
    description:
      `Connect any of ${BROKER_COUNT_PHRASE}, including ${SHORT_BROKER_EXAMPLES}, for read-only trade import — or log trades manually. See how Trend Chasers fits your workflow.`,
    path: '/brokers',
  },
  guides: {
    // The page's own heading now says Tutorials; the meta should agree with what a searcher lands on.
    title: 'Tutorials — Trend Chasers',
    description:
      'Step-by-step walkthroughs for connecting a broker, syncing trades, and getting the most out of your Trend Chasers journal.',
    path: '/guides',
  },
  refunds: {
    title: 'Refund Policy — Trend Chasers',
    description:
      '30-day money-back guarantee on every paid plan. No questions asked, no conditions. Cancel any time and keep your journal.',
    path: '/refunds',
  },
  privacy: {
    title: 'Privacy Policy — Trend Chasers',
    description:
      'Your trades stay yours. Learn how Trend Chasers handles journal data, optional cloud sync, and account info — without ever touching your brokerage.',
    path: '/privacy',
  },
  terms: {
    title: 'Terms of Service — Trend Chasers',
    description: 'Terms of use for Trend Chasers, the free trading journal with P&L calendar and broker imports.',
    path: '/terms',
  },
  'report-bug': {
    title: 'Report a Bug — Trend Chasers',
    description: 'Found something broken? Tell us and we will fix it.',
    path: '/report-bug',
    noindex: true,
  },
  'request-broker': {
    title: 'Request Broker Support — Trend Chasers',
    description:
      'Trade with a broker we do not support yet? Request CSV or screenshot import — we will configure it for your workflow.',
    path: '/request-broker',
  },
  app: {
    title: 'Journal — Trend Chasers',
    description: 'Your Trend Chasers trading journal dashboard.',
    path: '/app',
    noindex: true,
  },
  admin: {
    title: 'Admin — Trend Chasers',
    description: 'Trend Chasers admin panel.',
    path: '/admin',
    noindex: true,
  },
  'whats-new': {
    title: "What's New — Trend Chasers",
    description: 'Product updates and changes to Trend Chasers, newest first.',
    path: '/whats-new',
  },
  'market-simulator': {
    title: 'Market Simulator (Coming Soon) — Trend Chasers',
    description: 'Practice trading strategies risk-free. Coming soon to Trend Chasers.',
    path: '/market-simulator',
    noindex: true,
  },
  'ai-assistant': {
    title: 'AI Assistant (Coming Soon) — Trend Chasers',
    description: 'An AI assistant for your trading habits. Coming soon to Trend Chasers.',
    path: '/ai-assistant',
    noindex: true,
  },
  pricing: {
    title: 'Pricing (Coming Soon) — Trend Chasers',
    description: 'Trend Chasers pricing details. Coming soon.',
    path: '/pricing',
    noindex: true,
  },
  'help-center': {
    title: 'Help Center — Trend Chasers',
    description: 'Answers and how-tos for Trend Chasers, organized by area — brokers, dashboard, journal, settings, privacy, and support.',
    path: '/help-center',
  },
};

const COACH_SEO: PageSeo = {
  title: 'Coach View — Trend Chasers',
  description: 'Read-only shared trading journal view on Trend Chasers.',
  path: '/coach',
  noindex: true,
};

export function getPageSeo(
  route: AppRoute,
  coachToken?: string,
  guideSlug?: string,
  brokerSlug?: string,
): PageSeo {
  if (route === 'coach') {
    return coachToken ? { ...COACH_SEO, path: `/coach/${coachToken}` } : COACH_SEO;
  }

  if (route === 'guide' && guideSlug) {
    const guide = getGuideBySlug(guideSlug);
    if (guide) {
      return {
        title: `${guide.title} — Trend Chasers`,
        description: guide.description,
        path: guide.path,
      };
    }
    return {
      title: 'Guide — Trend Chasers',
      description: 'Trading journal guide on Trend Chasers.',
      path: `/guides/${guideSlug}`,
      noindex: true,
    };
  }

  if (route === 'broker-guide' && brokerSlug) {
    const guide = getBrokerGuideBySlug(brokerSlug);
    if (guide) {
      return {
        title: guide.title,
        description: guide.description,
        path: guide.path,
      };
    }
    return {
      title: 'Broker Guide — Trend Chasers',
      description: 'Broker import guide on Trend Chasers.',
      path: `/brokers/${brokerSlug}`,
      noindex: true,
    };
  }

  return PAGE_SEO[route as Exclude<AppRoute, 'coach' | 'guide' | 'broker-guide'>];
}

/** Public marketing routes prerendered at build time for crawlers. */
export const PRERENDER_ROUTES = [
  '/',
  '/brokers',
  '/brokers/thinkorswim',
  '/brokers/charles-schwab',
  '/brokers/robinhood',
  '/guides',
  '/guides/broker-sync-now-live',
  '/guides/free-trading-journal',
  '/guides/how-broker-sync-works',
  '/guides/pnl-calendar-trading-journal',
  '/privacy',
  '/terms',
  '/refunds',
  '/request-broker',
  '/report-bug',
  '/whats-new',
] as const;
