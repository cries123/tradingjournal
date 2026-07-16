import { useLayoutEffect } from 'react';
import type { AppRoute } from '../hooks/useRoute';
import { buildStructuredData } from '../seo/structuredData';

const SCRIPT_ID = 'structured-data-dynamic';

export function useStructuredData(route: AppRoute, guideSlug?: string, brokerSlug?: string) {
  useLayoutEffect(() => {
    const graph = buildStructuredData(route, guideSlug, brokerSlug);
    let el = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (!el) {
      el = document.createElement('script');
      el.id = SCRIPT_ID;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }

    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': graph,
    });

    return () => {
      el?.remove();
    };
  }, [route, guideSlug, brokerSlug]);
}
