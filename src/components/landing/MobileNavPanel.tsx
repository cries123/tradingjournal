import { useEffect, useRef, useState } from 'react';
import { BookOpen, Building2, Gauge, LifeBuoy, LogOut, Megaphone, Sparkles, Tag } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { accountDisplayName, accountInitial } from '../../utils/accountName';
import type { ExtraNavRoute } from '../../hooks/useRoute';

interface MobileNavPanelProps {
  open: boolean;
  onClose: () => void;
  onLaunch: () => void;
  onGuides?: () => void;
  onBrokers?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
  showBrokersLink?: boolean;
}

function SoonBadge() {
  return (
    <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-secondary bg-bg-tertiary border border-border/60 rounded-full px-2 py-0.5">
      Soon
    </span>
  );
}

export function MobileNavPanel({
  open,
  onClose,
  onLaunch,
  onGuides,
  onBrokers,
  onNavigate,
  showBrokersLink = true,
}: MobileNavPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { user, username, loading: authLoading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  useEscapeToClose(onClose);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  const signedIn = !authLoading && Boolean(user);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      onClose();
    } finally {
      setSigningOut(false);
    }
  };

  const go = (route: ExtraNavRoute) => {
    onNavigate?.(route);
    onClose();
  };

  const launch = () => {
    onLaunch();
    onClose();
  };

  const goGuides = () => {
    onGuides?.();
    onClose();
  };

  const goBrokers = () => {
    onBrokers?.();
    onClose();
  };

  return (
    <div
      ref={panelRef}
      id="mobile-nav-panel"
      className="sm:hidden border-t border-border/50 bg-bg-primary max-h-[70vh] overflow-y-auto"
    >
      <nav className="px-4 py-4 space-y-1" aria-label="Mobile">
        {/* The header can't fit a username at phone widths, so this is where a signed-in user
            actually sees who they're signed in as. */}
        {signedIn && (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-bg-tertiary/40 px-3 py-3">
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300"
              >
                {accountInitial(username, user)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {accountDisplayName(username, user)}
                </span>
                {user?.email && (
                  <span className="block truncate text-xs text-text-secondary">{user.email}</span>
                )}
              </span>
            </div>
            <div className="my-3 border-t border-border/50" />
          </>
        )}

        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Products
        </p>
        <button
          type="button"
          onClick={launch}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
        >
          <BookOpen className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden />
          <span className="text-sm font-medium text-text-primary">Journal</span>
        </button>
        <button
          type="button"
          onClick={() => go('market-simulator')}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
        >
          <Gauge className="h-4 w-4 text-text-secondary shrink-0" aria-hidden />
          <span className="text-sm font-medium text-text-primary">Market Simulator</span>
          <SoonBadge />
        </button>
        <button
          type="button"
          onClick={() => go('ai-assistant')}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
        >
          <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden />
          <span className="text-sm font-medium text-text-primary">AI Assistant</span>
        </button>
        <button
          type="button"
          onClick={() => go('pricing')}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
        >
          <Tag className="h-4 w-4 text-text-secondary shrink-0" aria-hidden />
          <span className="text-sm font-medium text-text-primary">Pricing</span>
        </button>
        <button
          type="button"
          onClick={() => go('whats-new')}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
        >
          <Megaphone className="h-4 w-4 text-text-secondary shrink-0" aria-hidden />
          <span className="text-sm font-medium text-text-primary">What&apos;s New</span>
        </button>

        <div className="my-3 border-t border-border/50" />

        <button
          type="button"
          onClick={goGuides}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
        >
          <span className="text-sm font-medium text-text-primary">Tutorials</span>
        </button>
        {showBrokersLink && (
          <button
            type="button"
            onClick={goBrokers}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
          >
            <Building2 className="h-4 w-4 text-text-secondary shrink-0" aria-hidden />
            <span className="text-sm font-medium text-text-primary">Brokers</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => go('help-center')}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-bg-tertiary/60 transition-colors"
        >
          <LifeBuoy className="h-4 w-4 text-text-secondary shrink-0" aria-hidden />
          <span className="text-sm font-medium text-text-primary">Help Center</span>
        </button>

        <div className="my-3 border-t border-border/50" />

        <button type="button" onClick={launch} className="w-full btn-primary text-sm py-3">
          {signedIn ? 'Open journal' : 'Sign up / Sign in'}
        </button>

        {signedIn && (
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary/60 hover:text-text-primary disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        )}
      </nav>
    </div>
  );
}
