/**
 * Names a path so a back link can say where it leads.
 *
 * "Back" with no destination is a small cruelty on a phone, where the browser chrome is often
 * hidden and the in-page link is the only way back.
 */
const NAMED_PATHS: Record<string, string> = {
  '/': 'home',
  '/app': 'the journal',
  '/guides': 'guides',
  '/brokers': 'supported brokers',
  '/pricing': 'pricing',
  '/help-center': 'the help center',
  '/support': 'support',
  '/report-bug': 'report a bug',
  '/request-broker': 'broker requests',
  '/whats-new': "what's new",
  '/market-simulator': 'the market simulator',
  '/ai-assistant': 'the AI assistant',
  '/privacy': 'the privacy policy',
  '/terms': 'the terms',
  '/refunds': 'the refund policy',
  '/admin': 'admin',
};

export function nameForPath(path: string | null): string {
  if (!path) return 'home';

  const clean = path.replace(/\/+$/, '') || '/';
  const named = NAMED_PATHS[clean];
  if (named) return named;

  // A detail page under a section reads better as its section: coming back from one tutorial to
  // another is still, to the person doing it, coming back to the guides.
  if (clean.startsWith('/guides/')) return 'guides';
  if (clean.startsWith('/brokers/')) return 'supported brokers';

  return 'home';
}

export function backLabelForPath(path: string | null): string {
  return `Back to ${nameForPath(path)}`;
}
