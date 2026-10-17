import { useEffect } from 'react';
import type { AppRoute } from './useRoute';

/**
 * The Tawk.to widget, on the public pages only.
 *
 * Deliberately NOT on /app or /admin. Those screens show broker connections, account balances and
 * realised P&L, and a chat widget is third-party JavaScript in the same document — Tawk's own
 * feature list includes screen sharing. Nobody's trading account should be one support agent's
 * misclick away from a vendor, and a visitor with a pre-sale question is not on those screens
 * anyway. The people who ARE signed in have support tickets, which reply by email and keep the
 * thread.
 *
 * Loads on the live domain only, so preview deploys, forks and local dev never put a visitor
 * through to an inbox nobody is watching.
 */

/** Pages the widget must never appear on. Everything else is marketing or support content. */
const PRIVATE_ROUTES: AppRoute[] = ['app', 'admin'];

/**
 * The embed URL, in the repo rather than an environment variable.
 *
 * Not a secret: this exact string is served in the HTML of every site that uses Tawk, and it
 * identifies a chat inbox rather than granting access to one. Putting it here means production
 * works with nothing to configure and nothing to forget on a redeploy, which is the failure mode
 * an env var would actually have had.
 */
const TAWK_SRC = 'https://embed.tawk.to/6ab0543ea9526b3442636c9c/1k30ci5ip';

/**
 * The only hosts that open a real chat.
 *
 * A preview deploy, a fork or localhost loading the widget puts a visitor through to an inbox
 * nobody is watching — and worse, it is indistinguishable at the Tawk end from a real customer on
 * the live site. VITE_TAWK_SRC overrides this when the widget itself needs testing somewhere else.
 */
const LIVE_HOSTS = ['trendchasers.net', 'www.trendchasers.net'];

function embedSrc(): string | null {
  const override = import.meta.env.VITE_TAWK_SRC as string | undefined;
  if (override) return override;
  if (typeof window === 'undefined') return null;
  return LIVE_HOSTS.includes(window.location.hostname) ? TAWK_SRC : null;
}

interface TawkApi {
  hideWidget?: () => void;
  showWidget?: () => void;
  onLoad?: () => void;
}

function tawk(): TawkApi {
  const w = window as unknown as { Tawk_API?: TawkApi };
  w.Tawk_API = w.Tawk_API ?? {};
  return w.Tawk_API;
}

/**
 * Tawk's tab nudge: "1 new message", flashed into the document title whenever its automated
 * greeting fires, because the greeting counts as an unread message. Every visitor saw a tab
 * claiming a message that nobody had sent. The dashboard trigger is the real fix; this keeps the
 * title ours in the meantime, and whenever a trigger is added again.
 */
export function isTawkTitleNudge(title: string): boolean {
  return /^\(?\d+\)?\s*new message/i.test(title.trim());
}

/** Puts the page's own title back whenever the widget swaps it for its nudge. */
function keepTitle(): () => void {
  const titleEl = document.querySelector('title');
  if (!titleEl) return () => {};
  let own = document.title;
  const observer = new MutationObserver(() => {
    const now = document.title;
    if (isTawkTitleNudge(now)) {
      if (now !== own) document.title = own;
    } else {
      // A real change — a route's own title — becomes the one to restore to.
      own = now;
    }
  });
  observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
}

export function useLiveChat(route: AppRoute): void {
  useEffect(() => {
    const src = embedSrc();
    if (!src) return;
    return keepTitle();
  }, []);

  useEffect(() => {
    const src = embedSrc();
    if (!src) return;

    const isPrivate = PRIVATE_ROUTES.includes(route);
    const api = tawk();

    /*
     * Hidden rather than removed on a private route.
     *
     * Tawk attaches an iframe, listeners and a socket outside anything this effect owns, so
     * deleting the script tag would leave all of that running with nothing pointing at it. Its own
     * hideWidget is the supported way, and it survives the client-side navigation that is the only
     * way to reach /app with the widget already loaded — arriving there directly never injects it.
     *
     * Applied through onLoad as well as directly: on the first paint of a private route the script
     * may still be in flight, and a hide call made before Tawk is ready is simply lost.
     */
    const apply = () => {
      const live = tawk();
      if (isPrivate) live.hideWidget?.();
      else live.showWidget?.();
    };

    api.onLoad = apply;
    apply();

    // Never inject on a private route — a direct load of /app should not fetch it at all.
    if (isPrivate || document.getElementById('tawk-embed')) return;

    const script = document.createElement('script');
    script.id = 'tawk-embed';
    script.async = true;
    script.src = src;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.head.appendChild(script);
  }, [route]);
}
