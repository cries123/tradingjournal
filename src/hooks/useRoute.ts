import { useCallback, useEffect, useState } from 'react';

export type AppRoute =
  | 'landing'
  | 'app'
  | 'brokers'
  | 'broker-guide'
  | 'privacy'
  | 'terms'
  | 'refunds'
  | 'coach'
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
  | 'whats-new';

/** Nav destinations reachable from the header dropdown and the footer — the "coming soon" and
 *  changelog pages, plus the two support pages the footer links to. Kept as its own union so a
 *  nav handler can't be passed a route like 'coach' that needs a token. */
export type ExtraNavRoute =
  | 'refunds'
  | 'market-simulator'
  | 'ai-assistant'
  | 'pricing'
  | 'help-center'
  | 'whats-new'
  | 'report-bug'
  | 'support'
  | 'request-broker';

const ROUTE_PATHS: Record<Exclude<AppRoute, 'coach' | 'guide' | 'broker-guide'>, string> = {
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
};

interface RouteState {
  route: AppRoute;
  coachToken?: string;
  guideSlug?: string;
  brokerSlug?: string;
}

function readRoute(): RouteState {
  const path = window.location.pathname;
  const coachMatch = path.match(/^\/coach\/([a-zA-Z0-9]+)/);
  if (coachMatch) return { route: 'coach', coachToken: coachMatch[1] };

  if (path.startsWith('/guides/')) {
    const slug = path.slice('/guides/'.length).replace(/\/$/, '');
    if (slug) return { route: 'guide', guideSlug: slug };
  }
  if (path === '/guides') return { route: 'guides' };

  if (path.startsWith('/brokers/')) {
    const slug = path.slice('/brokers/'.length).replace(/\/$/, '');
    if (slug) return { route: 'broker-guide', brokerSlug: slug };
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
  return { route: 'landing' };
}

export function useRoute() {
  const [state, setState] = useState<RouteState>(readRoute);
  const { route, coachToken, guideSlug, brokerSlug } = state;

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

  const navigate = useCallback((next: Exclude<AppRoute, 'coach' | 'guide' | 'broker-guide'>) => {
    window.history.pushState({}, '', ROUTE_PATHS[next]);
    setState({ route: next });
    if (next !== 'app') window.scrollTo(0, 0);
  }, []);

  const navigateGuide = useCallback((slug: string) => {
    window.history.pushState({}, '', `/guides/${slug}`);
    setState({ route: 'guide', guideSlug: slug });
    window.scrollTo(0, 0);
  }, []);

  const navigateBrokerGuide = useCallback((slug: string) => {
    window.history.pushState({}, '', `/brokers/${slug}`);
    setState({ route: 'broker-guide', brokerSlug: slug });
    window.scrollTo(0, 0);
  }, []);

  return { route, coachToken, guideSlug, brokerSlug, navigate, navigateGuide, navigateBrokerGuide };
}
