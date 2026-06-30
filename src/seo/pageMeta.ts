import type { AppRoute } from '../hooks/useRoute';

export const SITE_ORIGIN = 'https://trendchasers.net';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

export interface PageSeo {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

const PAGE_SEO: Record<Exclude<AppRoute, 'coach'>, PageSeo> = {
  landing: {
    title: 'Trend Chasers — Trading Journal & P&L Calendar',
    description:
      'Trend Chasers is a free trading journal with a P&L calendar, AI screenshot import, broker CSV uploads, and performance analytics.',
    path: '/',
  },
  brokers: {
    title: 'Supported Brokers — Trend Chasers Trading Journal',
    description:
      'Import trades into Trend Chasers from Thinkorswim, Schwab, and Robinhood via CSV or AI screenshot parsing — no brokerage login required.',
    path: '/brokers',
  },
  privacy: {
    title: 'Privacy Policy — Trend Chasers',
    description: 'How Trend Chasers handles your trading journal data, cloud sync, and account information.',
    path: '/privacy',
  },
  terms: {
    title: 'Terms of Service — Trend Chasers',
    description: 'Terms of service for the Trend Chasers trading journal web app.',
    path: '/terms',
  },
  'report-bug': {
    title: 'Report a Bug — Trend Chasers',
    description: 'Report an issue with Trend Chasers so we can fix it quickly.',
    path: '/report-bug',
    noindex: true,
  },
  'request-broker': {
    title: 'Request Broker Support — Trend Chasers',
    description: 'Request CSV or screenshot import support for your brokerage on Trend Chasers.',
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

export function getPageSeo(route: AppRoute, coachToken?: string): PageSeo {
  if (route === 'coach') {
    return coachToken ? { ...COACH_SEO, path: `/coach/${coachToken}` } : COACH_SEO;
  }
  return PAGE_SEO[route];
}

/** Public marketing routes prerendered at build time for crawlers. */
export const PRERENDER_ROUTES = [
  '/',
  '/brokers',
  '/privacy',
  '/terms',
  '/request-broker',
  '/report-bug',
] as const;
