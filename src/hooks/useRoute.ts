import { useCallback, useEffect, useState } from 'react';

export type AppRoute = 'landing' | 'app';

function readRoute(): AppRoute {
  return window.location.pathname.startsWith('/app') ? 'app' : 'landing';
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
    const path = next === 'app' ? '/app' : '/';
    window.history.pushState({}, '', path);
    setRoute(next);
  }, []);

  return { route, navigate };
}
