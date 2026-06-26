import { useCallback, useEffect, useState } from 'react';

export type AppRoute = 'landing' | 'app' | 'privacy' | 'terms';

const ROUTE_PATHS: Record<AppRoute, string> = {
  landing: '/',
  app: '/app',
  privacy: '/privacy',
  terms: '/terms',
};

function readRoute(): AppRoute {
  const path = window.location.pathname;
  if (path.startsWith('/app')) return 'app';
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
    const overflow = route === 'app' ? 'hidden' : 'auto';
    document.documentElement.style.overflow = overflow;
    document.body.style.overflow = overflow;
  }, [route]);

  const navigate = useCallback((next: AppRoute) => {
    window.history.pushState({}, '', ROUTE_PATHS[next]);
    setRoute(next);
    if (next !== 'app') window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
}
