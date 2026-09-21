import { useState } from 'react';
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

  return (
    <div
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
}
