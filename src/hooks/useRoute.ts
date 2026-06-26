import { useCallback, useEffect, useState } from 'react';

export type AppRoute = 'landing' | 'app' | 'brokers' | 'privacy' | 'terms';

const ROUTE_PATHS: Record<AppRoute, string> = {
  landing: '/',
  app: '/app',
  brokers: '/brokers',
  privacy: '/privacy',
  terms: '/terms',
};

function readRoute(): AppRoute {
  const path = window.location.pathname;
  if (path.startsWith('/app')) return 'app';
  if (path.startsWith('/brokers')) return 'brokers';
  if (path.startsWith('/privacy')) return 'privacy';
  if (path.startsWith('/terms')) return 'terms';
  return 'landing';
}

export function useRoute() {
  const [route, setRoute] = useState<AppRoute>(readRoute);

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const root = document.getElementById('root');
    const isApp = route === 'app';

    if (isApp) {
      root?.classList.add('route-app');
      root?.classList.remove('route-public');
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      root?.classList.remove('route-app');
      root?.classList.add('route-public');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
  }, [route]);

  const navigate = useCallback((next: AppRoute) => {
    window.history.pushState({}, '', ROUTE_PATHS[next]);
    setRoute(next);
    if (next !== 'app') window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
}
