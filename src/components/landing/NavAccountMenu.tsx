import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, NotebookPen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { accountDisplayName, accountInitial } from '../../utils/accountName';

interface NavAccountMenuProps {
  onLaunch: () => void;
}

/**
 * The signed-in half of the public nav: who you are, and a way back into the journal.
 *
 * Before this, a signed-in user browsing the marketing pages was shown "Sign up / Sign in" — which
 * reads as "you are logged out" and is the sort of thing that makes someone sign in twice and then
 * wonder whether they have two accounts.
 */
export function NavAccountMenu({ onLaunch }: NavAccountMenuProps) {
  const { user, username, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  useEscapeToClose(close);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!user) return null;

  const name = accountDisplayName(username, user);
  const initial = accountInitial(username, user);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      close();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-bg-secondary/60 py-1 pl-1 pr-2 sm:pr-2.5 hover:border-emerald-500/40 hover:bg-bg-secondary transition-colors focus-ring"
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300"
        >
          {initial}
        </span>
        {/* Hidden rather than dropped below sm: the name is the point of this control, but at 390px
            it competes with the logo and the journal button for the same 60 pixels. The mobile
            panel shows it in full instead. */}
        <span className="hidden sm:block max-w-[140px] truncate text-sm font-medium text-text-primary">
          {name}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-border/60 bg-bg-secondary p-2 shadow-xl shadow-black/20"
        >
          <div className="px-3 pb-2 pt-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Signed in as
            </p>
            <p className="mt-1 truncate text-sm font-medium text-text-primary">{name}</p>
            {user.email && (
              <p className="mt-0.5 truncate text-xs text-text-secondary">{user.email}</p>
            )}
          </div>

          <div className="my-1 border-t border-border/50" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onLaunch();
              close();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-primary"
          >
            <NotebookPen className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            <span className="text-sm font-medium text-text-primary">Open journal</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-primary disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
            <span className="text-sm font-medium text-text-primary">
              {signingOut ? 'Signing out…' : 'Sign out'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
