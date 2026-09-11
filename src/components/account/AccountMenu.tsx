import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CreditCard, LogOut, Receipt, UserCog } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { accountDisplayName, accountInitial } from '../../utils/accountName';

interface AccountMenuProps {
  onAccount: () => void;
  onSubscription: () => void;
  onOrderHistory: () => void;
}

/**
 * The account dropdown in the journal's top bar.
 *
 * Deliberately the same object as the one in the marketing nav — same avatar pill, same chevron,
 * same "signed in as" header, same order of items. Somebody who opened it on the pricing page and
 * then opened the journal should find the identical control in the identical place rather than
 * having to learn the app's version of it.
 *
 * It is a separate component from NavAccountMenu rather than a shared one because the two differ
 * in the thing that matters: out there the items have to cross a route change and hand their
 * destination over through sessionStorage, in here they are a function call on the view stack.
 * Merging them would mean a component that takes either a navigator or a route-crosser and picks,
 * which is more machinery than the twenty lines it would save.
 */
export function AccountMenu({ onAccount, onSubscription, onOrderHistory }: AccountMenuProps) {
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

  const items = [
    { label: 'Account settings', Icon: UserCog, run: onAccount },
    { label: 'Subscription', Icon: CreditCard, run: onSubscription },
    { label: 'Order history', Icon: Receipt, run: onOrderHistory },
  ];

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-border/70 py-1 pl-1 pr-2 transition-colors hover:border-border hover:bg-bg-tertiary/50 focus-ring"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-tertiary text-[11px] font-semibold text-accent">
          {initial}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          /* Right-aligned: the button sits at the right edge of the bar, and a left-aligned panel
             would hang off the side of the viewport on a phone. */
          className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-border bg-bg-secondary p-1.5 shadow-2xl"
        >
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              Signed in as
            </p>
            <p className="mt-1 truncate text-sm font-medium text-text-primary">{name}</p>
            {user.email && (
              <p className="mt-0.5 truncate text-xs text-text-secondary">{user.email}</p>
            )}
          </div>

          <div className="my-1 border-t border-border/50" />

          {items.map(({ label, Icon, run }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                run();
                close();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-primary"
            >
              <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
              <span className="text-sm font-medium text-text-primary">{label}</span>
            </button>
          ))}

          <div className="my-1 border-t border-border/50" />

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
