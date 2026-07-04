import { useEffect } from 'react';
import type { AppRoute } from './useRoute';
import { useAuth } from '../context/AuthContext';
import { recordAnonymousVisit } from '../services/visitorAnalytics';

const ROUTE_PATHS: Partial<Record<AppRoute, string>> = {
  landing: '/',
  app: '/app',
  brokers: '/brokers',
  guides: '/guides',
  privacy: '/privacy',
  terms: '/terms',
  'report-bug': '/report-bug',
  'request-broker': '/request-broker',
};

/** Track anonymous site visits for admin conversion metrics. */
export function useVisitorTracking(route: AppRoute, guideSlug?: string) {
  const { user, loading, firebaseEnabled } = useAuth();

  useEffect(() => {
    if (!firebaseEnabled || loading || user) return;
    if (route === 'admin' || route === 'coach') return;

    const path =
      route === 'guide' && guideSlug
        ? `/guides/${guideSlug}`
        : ROUTE_PATHS[route] ?? '/';

    void recordAnonymousVisit(path);
  }, [route, guideSlug, user, loading, firebaseEnabled]);
}
