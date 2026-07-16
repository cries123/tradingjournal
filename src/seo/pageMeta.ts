import type { AppRoute } from '../hooks/useRoute';
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
      'Free trading journal to track and improve your performance. Visual P&L calendar, import from your brokerage via screenshot or CSV — no broker login required.',
    path: '/',
  },
  brokers: {
    title: 'Supported Brokers — Trend Chasers Trading Journal',
    description:
      'Import trades from your brokerage with AI screenshot parsing or CSV. No brokerage login, no API keys. See how Trend Chasers fits your workflow.',
    path: '/brokers',
  },
  guides: {
    title: 'Trading Journal Guides — Trend Chasers',
    description:
      'Guides on free trading journals, P&L calendars, and tracking performance without connecting your brokerage login.',
    path: '/guides',
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
  '/guides/free-trading-journal',
  '/guides/trading-journal-without-broker-login',
  '/guides/pnl-calendar-trading-journal',
  '/privacy',
  '/terms',
  '/request-broker',
  '/report-bug',
] as const;
