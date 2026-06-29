import {
  Building2,
  Camera,
  FileSpreadsheet,
  HelpCircle,
  LayoutDashboard,
  MessageSquarePlus,
  Settings,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { SidebarJournalPicker } from './SidebarJournalPicker';
import { useAuth } from '../context/AuthContext';

export type SidebarAppView = 'dashboard' | 'settings';

interface SidebarProps {
  appView: SidebarAppView;
  onDashboard: () => void;
  onAddTrade: () => void;
  onImportScreenshot: () => void;
  onImportCsv: () => void;
  onClearAll: () => void;
  onSettings: () => void;
  onHome?: () => void;
  onBrokers?: () => void;
  variant?: 'desktop' | 'drawer';
  onNavigate?: () => void;
}

function navItemClass(active: boolean): string {
  return active
    ? 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium focus-ring'
    : 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring';
}

export function Sidebar({
  appView,
  onDashboard,
  onAddTrade,
  onImportScreenshot,
  onImportCsv,
  onClearAll,
  onSettings,
  onHome,
  onBrokers,
  variant = 'desktop',
  onNavigate,
}: SidebarProps) {
  const { user, loading, firebaseEnabled, logout, username } = useAuth();

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
            <LayoutDashboard size={16} className={appView === 'dashboard' ? 'text-emerald-400' : undefined} />
            Overview
          </button>
          <button
            type="button"
            onClick={wrap(onSettings)}
            className={navItemClass(appView === 'settings')}
          >
            <Settings size={16} />
            Settings
          </button>
        </nav>

        <div className="px-3 pt-4">
          <SidebarJournalPicker onNavigate={onNavigate} />
        </div>

        <div className="px-3 pt-4 pb-3">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
            Help
          </p>
          <div className="space-y-0.5">
            {onBrokers ? (
              <button
                type="button"
                onClick={wrap(onBrokers)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
              >
                <Building2 size={15} />
                Supported brokers
              </button>
            ) : (
              <a
                href="/brokers"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
              >
                <Building2 size={15} />
                Supported brokers
              </a>
            )}
            <a
              href="/report-bug"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
            >
              <HelpCircle size={15} />
              Report a bug
            </a>
            <a
              href="/request-broker"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
            >
              <MessageSquarePlus size={15} />
              Request broker
            </a>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border/60 shrink-0 space-y-3">
        {firebaseEnabled && !loading && user && (
          <div className="flex items-center gap-2 px-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              {username ? (
                <p className="text-[11px] text-emerald-300 font-medium truncate">@{username}</p>
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

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={wrap(onImportCsv)}
            className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border border-border/60 text-text-secondary hover:text-text-primary hover:border-border transition-colors focus-ring"
          >
            <FileSpreadsheet size={14} />
            CSV
          </button>
          <button
            type="button"
            onClick={wrap(onImportScreenshot)}
            className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border border-border/60 text-text-secondary hover:text-text-primary hover:border-border transition-colors focus-ring"
          >
            <Camera size={14} />
            Screenshot
          </button>
        </div>

        <button
          type="button"
          onClick={wrap(onClearAll)}
          className="w-full py-1 text-[10px] text-text-secondary/70 hover:text-red-400 transition-colors focus-ring rounded"
        >
          Clear all trades
        </button>
      </div>
    </aside>
  );
}
