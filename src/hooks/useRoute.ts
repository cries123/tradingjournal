import { useCallback, useEffect, useState } from 'react';

export type AppRoute = 'landing' | 'app' | 'brokers' | 'privacy' | 'terms' | 'coach';

const ROUTE_PATHS: Record<Exclude<AppRoute, 'coach'>, string> = {
  landing: '/',
  app: '/app',
  brokers: '/brokers',
  privacy: '/privacy',
  terms: '/terms',
};

interface RouteState {
  route: AppRoute;
  coachToken?: string;
}

function readRoute(): RouteState {
  const path = window.location.pathname;
  const coachMatch = path.match(/^\/coach\/([a-zA-Z0-9]+)/);
  if (coachMatch) return { route: 'coach', coachToken: coachMatch[1] };
  if (path.startsWith('/app')) return { route: 'app' };
  if (path.startsWith('/brokers')) return { route: 'brokers' };
  if (path.startsWith('/privacy')) return { route: 'privacy' };
  if (path.startsWith('/terms')) return { route: 'terms' };
  return { route: 'landing' };
}

export function useRoute() {
  const [state, setState] = useState<RouteState>(readRoute);
  const { route, coachToken } = state;

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

  const navigate = useCallback((next: Exclude<AppRoute, 'coach'>) => {
    window.history.pushState({}, '', ROUTE_PATHS[next]);
    setState({ route: next });
    if (next !== 'app') window.scrollTo(0, 0);
  }, []);

  return { route, coachToken, navigate };
}
