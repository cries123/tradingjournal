import { useEffect, useState } from 'react';
import {
  Building2,
  HelpCircle,
  LayoutDashboard,
  Link2,
  MessageSquarePlus,
  Settings,
  Share2,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { PlanBadge } from './plan/PlanBadge';
import { BrandLogo } from './BrandLogo';
import { SidebarJournalPicker } from './SidebarJournalPicker';
import { useAuth } from '../context/AuthContext';
import { isCurrentUserAdmin } from '../services/admin';

export type SidebarAppView =
  | 'dashboard'
  | 'settings'
  | 'brokers'
  | 'connect-broker'
  | 'report-bug'
  | 'request-broker'
  | 'leaderboard';

interface SidebarProps {
  appView: SidebarAppView;
  onDashboard: () => void;
  onAddTrade: () => void;
  onConnectBroker: () => void;
  onClearAll: () => void;
  onSettings: () => void;
  onBrokers: () => void;
  onReportBug: () => void;
  onRequestBroker: () => void;
  onLeaderboard: () => void;
  onShareCard?: () => void;
  shareCardEnabled?: boolean;
  onAdmin?: () => void;
  onHome?: () => void;
  variant?: 'desktop' | 'drawer';
  onNavigate?: () => void;
}

function navItemClass(active: boolean): string {
  return active
    ? 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-accent/10 text-accent border border-accent/20 font-medium focus-ring'
    : 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring';
}

export function Sidebar({
  appView,
  onDashboard,
  onAddTrade,
  onConnectBroker,
  onClearAll,
  onSettings,
  onBrokers,
  onReportBug,
  onRequestBroker,
  onLeaderboard,
  onShareCard,
  shareCardEnabled = false,
  onAdmin,
  onHome,
  variant = 'desktop',
  onNavigate,
}: SidebarProps) {
  const { user, loading, firebaseEnabled, logout, username } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user?.uid || !firebaseEnabled) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void isCurrentUserAdmin(user.uid).then((ok) => {
      if (!cancelled) setIsAdmin(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, firebaseEnabled]);

  const wrap = (fn: () => void) => () => {
    fn();
    onNavigate?.();
  };

  const shellClass =
    variant === 'drawer'
      ? 'flex flex-col w-full h-full bg-bg-secondary/95 backdrop-blur-xl'
      : 'flex flex-col w-56 shrink-0 sticky top-0 h-dvh bg-bg-secondary/80 backdrop-blur-xl border-r border-border/60';

  return (
    <aside className={`${shellClass} overflow-hidden`}>
      <div className="px-4 py-3.5 border-b border-border/60 shrink-0">
        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            className="text-left hover:opacity-90 transition-opacity focus-ring rounded"
            title="Back to home"
          >
            <BrandLogo size="lg" variant="compact" />
          </button>
        ) : (
          <BrandLogo size="lg" variant="compact" />
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
        <nav className="px-3 pt-3 space-y-1">
          <button
            type="button"
            onClick={wrap(onDashboard)}
            className={navItemClass(appView === 'dashboard')}
          >
            <LayoutDashboard size={16} className={appView === 'dashboard' ? 'text-accent' : undefined} />
            Overview
          </button>
          <button
            type="button"
            onClick={wrap(onConnectBroker)}
            className={navItemClass(appView === 'connect-broker')}
          >
            <Link2 size={16} className={appView === 'connect-broker' ? 'text-accent' : undefined} />
            Connect broker
          </button>
          <button
            type="button"
            onClick={wrap(onSettings)}
            className={navItemClass(appView === 'settings')}
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            type="button"
            onClick={wrap(onLeaderboard)}
            className={navItemClass(appView === 'leaderboard')}
          >
            <Trophy size={16} className={appView === 'leaderboard' ? 'text-accent' : undefined} />
            Leaderboard
          </button>
          {onShareCard && (
            <button
              type="button"
              onClick={wrap(onShareCard)}
              disabled={!shareCardEnabled}
              /* Separated from the links above it: everything else in this nav is a place you go,
                 this is a thing you do. Sitting flush in the same list made it read as a fifth
                 destination, and it already exists as a button in the toolbar. */
              className={`${navItemClass(false)} mt-2 pt-3 border-t border-border/40 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Share2 size={16} />
              Share month
            </button>
          )}
        </nav>

        <div className="px-3 pt-4">
          <SidebarJournalPicker onNavigate={onNavigate} />
        </div>

        <div className="px-3 pt-4 pb-3">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
            Help
          </p>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={wrap(onBrokers)}
              className={navItemClass(appView === 'brokers')}
            >
              <Building2 size={15} />
              Supported brokers
            </button>
            <button
              type="button"
              onClick={wrap(onReportBug)}
              className={navItemClass(appView === 'report-bug')}
            >
              <HelpCircle size={15} />
              Report a bug
            </button>
            <button
              type="button"
              onClick={wrap(onRequestBroker)}
              className={navItemClass(appView === 'request-broker')}
            >
              <MessageSquarePlus size={15} />
              Request broker
            </button>
            {isAdmin && onAdmin && (
              <button
                type="button"
                onClick={wrap(onAdmin)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-amber-300/90 hover:text-amber-200 hover:bg-amber-500/10 transition-colors focus-ring"
              >
                <ShieldCheck size={15} />
                Admin
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border/60 shrink-0 space-y-3">
        <PlanBadge />

        {firebaseEnabled && !loading && user && (
          <div className="flex items-center gap-2 px-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <div className="min-w-0 flex-1">
              {username ? (
                <p className="text-[11px] text-accent font-medium truncate">@{username}</p>
              ) : null}
              <p className="text-[11px] text-text-secondary truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-[11px] text-text-secondary hover:text-text-primary shrink-0 focus-ring rounded"
            >
              Sign out
            </button>
          </div>
        )}

        {firebaseEnabled && !loading && !user && (
          <p className="text-[10px] text-text-secondary px-1">Sign in to sync across devices</p>
        )}

        {!firebaseEnabled && (
          <p className="text-[10px] text-text-secondary px-1 leading-relaxed">
            Trades saved locally in this browser
          </p>
        )}

        <button type="button" onClick={wrap(onAddTrade)} className="w-full py-2.5 btn-primary text-sm font-semibold">
          + Log Trade
        </button>

        <button
          type="button"
          onClick={wrap(onClearAll)}
          className="w-full py-1 text-[10px] text-text-secondary/70 hover:text-red-400 transition-colors focus-ring rounded"
        >
          Clear journal
        </button>
      </div>
    </aside>
  );
}
