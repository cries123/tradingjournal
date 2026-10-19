import { useEffect, useRef, useState } from 'react';
import {
  BookOpenText,
  ChevronUp,
  CreditCard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Receipt,
  Settings,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { TIER_PLANS } from '../../config/tiers';
import { accountDisplayName, accountInitial } from '../../utils/accountName';
import { navigateToPath } from '../../utils/navigateToPath';
import { PLAN_PILL } from './planPill';

interface ProfileMenuProps {
  onSettings: () => void;
  onAccount: () => void;
  onSubscription: () => void;
  onOrderHistory: () => void;
  onSupport: () => void;
  onAdmin?: () => void;
  isAdmin: boolean;
  supportUnread: number;
  /** One of the screens this menu opens is on screen, so the row is the "you are here". */
  active: boolean;
}

/**
 * Who you are, at the foot of the sidebar, and everything about the account behind it.
 *
 * Settings, Support and the three billing screens used to be split between an "Account" section of
 * the nav and a dropdown in the top bar — two places to look for one kind of thing, and a top bar
 * that existed only to hold that dropdown. They live together behind the row that already said who
 * you were, the way every desktop app the trader also uses does it. Support's unread count rides on
 * the row itself, so a reply is seen without opening anything.
 */
export function ProfileMenu({
  onSettings,
  onAccount,
  onSubscription,
  onOrderHistory,
  onSupport,
  onAdmin,
  isAdmin,
  supportUnread,
  active,
}: ProfileMenuProps) {
  const { user, username, logout } = useAuth();
  const { tier, loaded } = useEntitlement();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  useEscapeToClose(close, open);

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

  const groups: { label: string; Icon: typeof Settings; run: () => void; badge?: number }[][] = [
    [
      { label: 'Settings', Icon: Settings, run: onSettings },
      { label: 'Account settings', Icon: UserCog, run: onAccount },
      { label: 'Subscription', Icon: CreditCard, run: onSubscription },
      { label: 'Order history', Icon: Receipt, run: onOrderHistory },
    ],
    [
      { label: 'Support', Icon: LifeBuoy, run: onSupport, badge: supportUnread },
      { label: 'Help center', Icon: BookOpenText, run: () => navigateToPath('/help-center') },
      { label: "What's new", Icon: Megaphone, run: () => navigateToPath('/whats-new') },
      ...(isAdmin && onAdmin ? [{ label: 'Admin', Icon: ShieldCheck, run: onAdmin }] : []),
    ],
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
      {open && (
        <div
          role="menu"
          aria-label="Account"
          /* Opens upward: the row is the last thing in the panel, and a menu dropping off the bottom
             of the window is a menu half of whose items cannot be reached. Exactly as wide as the
             row, because the sidebar clips whatever hangs past its edge (overflow-hidden keeps its
             scroll area from showing a rail) — a wider menu loses its right-hand side. */
          className="absolute bottom-full inset-x-0 z-50 mb-2 rounded-xl border border-border bg-bg-secondary p-1.5 shadow-2xl"
        >
          {groups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-1 pt-1 border-t border-border/50' : ''}>
              {group.map(({ label, Icon, run, badge }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    run();
                    close();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-primary focus-ring"
                >
                  <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                  <span className="flex-1 text-sm text-text-primary">{label}</span>
                  {badge != null && badge > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 bg-accent/20 text-accent">
                      {badge} new
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-1 pt-1 border-t border-border/50">
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-primary disabled:opacity-60 focus-ring"
            >
              <LogOut className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
              <span className="text-sm text-text-primary">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors focus-ring ${
          open || active ? 'border-border bg-bg-tertiary' : 'border-border/60 hover:bg-bg-tertiary/60'
        }`}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[13px] font-semibold text-accent">
          {initial}
          {supportUnread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg-secondary"
              aria-label={`${supportUnread} unread support ${supportUnread === 1 ? 'reply' : 'replies'}`}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-text-primary">{username ? `@${username}` : name}</span>
          {user.email && <span className="block truncate text-[11px] text-text-secondary">{user.email}</span>}
        </span>
        {loaded && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PLAN_PILL[tier]}`}>
            {TIER_PLANS[tier].name}
          </span>
        )}
        <ChevronUp size={14} className={`shrink-0 text-text-secondary transition-transform ${open ? '' : 'rotate-180'}`} aria-hidden />
      </button>
    </div>
  );
}
