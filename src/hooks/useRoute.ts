import { useCallback, useEffect, useState } from 'react';
import { pushAppHistory } from '../utils/appHistory';

export type AppRoute =
  | 'landing'
  | 'app'
  | 'brokers'
  | 'broker-guide'
  | 'privacy'
  | 'terms'
  | 'refunds'
  | 'report-bug'
  | 'request-broker'
  | 'admin'
  | 'guides'
  | 'guide'
  | 'market-simulator'
  | 'ai-assistant'
  | 'pricing'
  | 'help-center'
  | 'support'
  | 'whats-new'
  | 'verified-records'
  | 'track-record';

/** Nav destinations reachable from the header dropdown and the footer — the "coming soon" and
 *  changelog pages, plus the two support pages the footer links to. Kept as its own union so a
 *  nav handler can't be passed a route that needs a slug. */
/** Every route reachable by name alone. */
export type NavRoute = Exclude<AppRoute, 'guide' | 'broker-guide' | 'track-record'>;

export type ExtraNavRoute =
  | 'refunds'
  | 'market-simulator'
  | 'ai-assistant'
  | 'pricing'
  | 'help-center'
  | 'whats-new'
  | 'verified-records'
  | 'report-bug'
  | 'support'
  | 'request-broker';

/** Slug-less routes only: 'guide', 'broker-guide' and 'track-record' each need one, so they
 *  navigate through their own function rather than through this table. */
const ROUTE_PATHS: Record<NavRoute, string> = {
  landing: '/',
  app: '/app',
  brokers: '/brokers',
  privacy: '/privacy',
  terms: '/terms',
  'report-bug': '/report-bug',
  'request-broker': '/request-broker',
  admin: '/admin',
  guides: '/guides',
  'market-simulator': '/market-simulator',
  'ai-assistant': '/ai-assistant',
  pricing: '/pricing',
  'help-center': '/help-center',
  support: '/support',
  refunds: '/refunds',
  'whats-new': '/whats-new',
  'verified-records': '/verified-track-record',
};

export interface RouteState {
  route: AppRoute;
  guideSlug?: string;
  brokerSlug?: string;
  /** The username whose published record is being viewed — /r/<name>. */
  recordSlug?: string;
}

/**
 * Path to route, with no window in it so it can be tested directly.
 *
 * Pulled out of readRoute because this is the part that breaks: the slug branches are three
 * near-identical lines of regex, and one of them shipping wrong is a page that silently falls
 * through to the landing page. The hook below is the only caller that knows about window.
 */
export function parseRoutePath(path: string): RouteState {
  if (path.startsWith('/guides/')) {
    const slug = path.slice('/guides/'.length).replace(/\/$/, '');
    if (slug) return { route: 'guide', guideSlug: slug };
  }
  if (path === '/guides') return { route: 'guides' };

  if (path.startsWith('/brokers/')) {
    const slug = path.slice('/brokers/'.length).replace(/\/$/, '');
    if (slug) return { route: 'broker-guide', brokerSlug: slug };
  }

  /* /r/<username>: short on purpose, because this path gets pasted into messages and bios. */
  if (path.startsWith('/r/')) {
    const slug = path.slice('/r/'.length).replace(/\/$/, '');
    if (slug) return { route: 'track-record', recordSlug: slug.toLowerCase() };
  }

  if (path.startsWith('/app')) return { route: 'app' };
  if (path.startsWith('/brokers')) return { route: 'brokers' };
  if (path.startsWith('/privacy')) return { route: 'privacy' };
  if (path.startsWith('/terms')) return { route: 'terms' };
  if (path.startsWith('/refunds')) return { route: 'refunds' };
  if (path.startsWith('/report-bug')) return { route: 'report-bug' };
  if (path.startsWith('/request-broker')) return { route: 'request-broker' };
  if (path.startsWith('/admin')) return { route: 'admin' };
  if (path.startsWith('/market-simulator')) return { route: 'market-simulator' };
  if (path.startsWith('/ai-assistant')) return { route: 'ai-assistant' };
  if (path.startsWith('/pricing')) return { route: 'pricing' };
  if (path.startsWith('/help-center')) return { route: 'help-center' };
  if (path.startsWith('/support')) return { route: 'support' };
  if (path.startsWith('/whats-new')) return { route: 'whats-new' };
  if (path.startsWith('/verified-track-record')) return { route: 'verified-records' };
  return { route: 'landing' };
}

function readRoute(): RouteState {
  return parseRoutePath(window.location.pathname);
}

export function useRoute() {
  const [state, setState] = useState<RouteState>(readRoute);
  const { route, guideSlug, brokerSlug, recordSlug } = state;

  useEffect(() => {
    const onPopState = () => setState(readRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const root = document.getElementById('root');

    const applyRouteStyles = () => {
      const isApp = route === 'app';

      if (isApp) {
        root?.classList.add('route-app');
        root?.classList.remove('route-public');
        const lockDocumentScroll = window.matchMedia('(max-width: 767px)').matches;
        document.documentElement.style.overflow = lockDocumentScroll ? 'hidden' : '';
        document.body.style.overflow = lockDocumentScroll ? 'hidden' : '';
      } else {
        root?.classList.remove('route-app');
        root?.classList.add('route-public');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    };

    applyRouteStyles();

    const mobileQuery = window.matchMedia('(max-width: 767px)');
    mobileQuery.addEventListener('change', applyRouteStyles);
    return () => mobileQuery.removeEventListener('change', applyRouteStyles);
  }, [route]);

  const navigate = useCallback((next: NavRoute) => {
    pushAppHistory(ROUTE_PATHS[next]);
    setState({ route: next });
    if (next !== 'app') window.scrollTo(0, 0);
  }, []);

  const navigateGuide = useCallback((slug: string) => {
    pushAppHistory(`/guides/${slug}`);
    setState({ route: 'guide', guideSlug: slug });
    window.scrollTo(0, 0);
  }, []);

  const navigateRecord = useCallback((slug: string) => {
    pushAppHistory(`/r/${slug}`);
    setState({ route: 'track-record', recordSlug: slug.toLowerCase() });
    window.scrollTo(0, 0);
  }, []);

  const navigateBrokerGuide = useCallback((slug: string) => {
    pushAppHistory(`/brokers/${slug}`);
    setState({ route: 'broker-guide', brokerSlug: slug });
    window.scrollTo(0, 0);
  }, []);

  return {
    route,
    guideSlug,
    brokerSlug,
    recordSlug,
    navigate,
    navigateGuide,
    navigateBrokerGuide,
    navigateRecord,
  };
}
