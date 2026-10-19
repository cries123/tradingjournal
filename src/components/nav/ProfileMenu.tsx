import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { TIER_PLANS } from '../../config/tiers';
import { accountDisplayName, accountInitial } from '../../utils/accountName';
import { navigateToPath } from '../../utils/navigateToPath';
import { PLAN_PILL, planLine } from './planPill';

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

interface Item {
  label: string;
  hint?: string;
  run: () => void;
  badge?: string;
  tone?: 'danger';
}

/**
 * Who you are, at the foot of the sidebar, and everything about the account behind it.
 *
 * Settings, Support and the billing screens used to be split between an "Account" section of the nav
 * and a dropdown in a top bar that held nothing else — two places to look for one kind of thing.
 * They live together behind the row that already said whose account it was, the way the desktop
 * apps a trader also uses do it. Emails and Export & backup are sections of Settings; their rows
 * open Settings, named for what people go there to do.
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
  const { tier, loaded, currentPeriodEnd, source } = useEntitlement();
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
  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      close();
    } finally {
      setSigningOut(false);
    }
  };

  const groups: Item[][] = [
    [
      { label: 'Settings', hint: 'Rules, playbook', run: onSettings },
      {
        label: 'Subscription',
        hint: loaded ? planLine(TIER_PLANS[tier].name, currentPeriodEnd, tier !== 'free' && source === 'purchase') : undefined,
        run: onSubscription,
      },
      { label: 'Order history', run: onOrderHistory },
      { label: 'Account settings', run: onAccount },
      { label: 'Emails', hint: 'Recaps and alerts', run: onSettings },
      { label: 'Export & backup', run: onSettings },
    ],
    [
      { label: 'Support', run: onSupport, badge: supportUnread > 0 ? `${supportUnread} new` : undefined },
      { label: 'Help center', run: () => navigateToPath('/help-center') },
      { label: "What's new", run: () => navigateToPath('/whats-new') },
      ...(isAdmin && onAdmin ? [{ label: 'Admin', run: onAdmin }] : []),
    ],
    [{ label: signingOut ? 'Signing out…' : 'Sign out', run: () => void signOut(), tone: 'danger' as const }],
  ];

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div
          role="menu"
          aria-label="Account"
          /* Opens upward from the last row in the panel, and wider than the panel: the sidebar
             sits above the page (z-30), so the menu overhangs the content rather than being cut. */
          className="absolute bottom-full left-0 z-50 mb-2 w-[300px] rounded-[14px] border border-[#2e2e2e] bg-[#161616] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
        >
          {groups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-[5px] border-t border-[#2a2a2a] pt-[5px]' : ''}>
              {group.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.run();
                    if (item.tone !== 'danger') close();
                  }}
                  disabled={item.tone === 'danger' && signingOut}
                  className={`flex w-full items-center justify-between gap-3 rounded-[9px] px-3 py-[9px] text-left text-[13px] transition-colors hover:bg-[#202020] focus-ring disabled:opacity-60 ${
                    item.tone === 'danger' ? 'text-loss-bright' : 'text-text-primary'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-400">{item.badge}</span>
                  ) : (
                    item.hint && <small className="text-[11.5px] text-text-secondary">{item.hint}</small>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? 'page' : undefined}
        className={`mt-2.5 flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus-ring ${
          open || active ? 'border-[#333] bg-[#151515]' : 'border-border hover:bg-[#151515]'
        }`}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1f2a18] text-[13px] font-bold text-accent">
          {initial}
          {/* A reply nobody opens is the same as no reply: the dot says one is waiting without
              opening the menu that holds Support. */}
          {supportUnread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-bg-secondary"
              role="img"
              aria-label={`${supportUnread} unread support ${supportUnread === 1 ? 'reply' : 'replies'}`}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-text-primary">{username ? `@${username}` : name}</span>
          {user.email && <span className="block truncate text-[11px] text-text-secondary">{user.email}</span>}
        </span>
        {loaded && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${PLAN_PILL[tier]}`}>{TIER_PLANS[tier].name}</span>}
      </button>
    </div>
  );
}
