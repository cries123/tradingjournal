import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';

const KEY = 'trend-chasers-impersonating';

/** Whose account this tab is inside, if it is inside anybody's. */
function readSession(): { label: string; uid: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { label?: unknown; uid?: unknown };
    if (typeof parsed.label !== 'string' || typeof parsed.uid !== 'string') return null;
    return { label: parsed.label, uid: parsed.uid };
  } catch {
    return null;
  }
}

/**
 * A bar across the top saying whose account you are in.
 *
 * The whole risk of impersonation is forgetting you are doing it. Every write in this session
 * lands in a customer's account and their history, so the only real protection is that the person
 * at the keyboard cannot lose track of where they are — hence fixed, unmissable, and carrying the
 * way out.
 *
 * sessionStorage rather than localStorage on purpose: it dies with the tab. A banner that outlived
 * the session would be worse than none, because it would be lying about something that matters.
 */
export function ImpersonationBanner() {
  const [session] = useState(readSession);
  const [leaving, setLeaving] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  /*
   * Pushes the app down by however tall the bar actually is.
   *
   * The bar is fixed, so without this it sits on top of the app’s own header — on a phone that
   * is the menu button, which makes the product unusable in exactly the session where somebody
   * is trying to reproduce a customer’s problem.
   *
   * Measured rather than hardcoded because the text wraps to two lines on a narrow screen and
   * one on a wide one. Padding rather than margin: #root on the app route is height:100dvh with
   * border-box sizing, so padding takes the space from the inside and nothing overflows.
   */
  useEffect(() => {
    const root = document.getElementById('root');
    const el = bar.current;
    if (!root || !el) return;

    const apply = () => root.style.setProperty('padding-top', `${el.offsetHeight}px`);
    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(el);

    return () => {
      observer.disconnect();
      root.style.removeProperty('padding-top');
    };
  }, [session]);

  if (!session) return null;

  const end = () => {
    setLeaving(true);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Sign-out below is what actually ends it; this only clears the banner.
    }
    if (!isFirebaseConfigured()) {
      window.location.assign('/');
      return;
    }
    void signOut(getFirebaseAuth()).finally(() => window.location.assign('/'));
  };

  const banner = (
    <div
      ref={bar}
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-[11px] font-semibold text-black"
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top, 0px))' }}
    >
      <span className="inline-flex items-center gap-1.5">
        <ShieldAlert size={13} aria-hidden />
        Signed in as {session.label} — everything you do lands in their account.
      </span>
      <button
        type="button"
        onClick={end}
        disabled={leaving}
        className="inline-flex items-center gap-1 rounded-md bg-black/15 px-2 py-0.5 hover:bg-black/25 transition-colors focus-ring disabled:opacity-60"
      >
        <LogOut size={11} aria-hidden />
        {leaving ? 'Ending…' : 'End session'}
      </button>
    </div>
  );

  /*
   * Portalled to document.body, not left where it is written.
   *
   * Mounted in App it became a direct child of #root, and on a phone that lands it under
   *
   *   @media (max-width: 767px) { #root.route-app > * { flex: 1 1 0; height: 100%; } }
   *
   * which stretched a one-line bar over the entire viewport and hid the app behind it. The
   * rule is right for the app’s own panes and wrong for an overlay, and desktop never showed
   * it because the 768px block drops the flex column entirely.
   *
   * On body it is subject to none of that, which is where a viewport-level overlay belongs.
   */
  return typeof document === 'undefined' ? banner : createPortal(banner, document.body);
}
