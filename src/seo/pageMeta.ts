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
      'Track wins and losses day by day on a visual calendar. Import via AI screenshot or CSV from your brokerage — never connect your broker login. Free.',
    path: '/',
  },
  brokers: {
    title: 'Supported Brokers — Trend Chasers Trading Journal',
    description:
      'Import trades from your brokerage with AI screenshot parsing or CSV. No brokerage login, no API keys. See how Trend Chasers fits your workflow.',
    path: '/brokers',
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
