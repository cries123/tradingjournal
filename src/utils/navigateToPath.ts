/**
 * Client-side navigation from anywhere, without threading a router callback down every tree.
 *
 * useRoute() re-reads the URL on popstate, so pushing state and firing the event is enough to
 * move the SPA — and unlike a plain <a href>, it doesn't throw away the loaded app to do it.
 */
export function navigateToPath(path: string): void {
  if (window.location.pathname === path) {
    window.scrollTo(0, 0);
    return;
  }
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function goToPricing(): void {
  navigateToPath('/pricing');
}
