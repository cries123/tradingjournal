import { Camera, FileSpreadsheet, LayoutDashboard, Settings } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  onAddTrade: () => void;
  onImportScreenshot: () => void;
  onImportCsv: () => void;
  onClearAll: () => void;
  onSettings: () => void;
  onHome?: () => void;
  variant?: 'desktop' | 'drawer';
  onNavigate?: () => void;
}

export function Sidebar({
  onAddTrade,
  onImportScreenshot,
  onImportCsv,
  onClearAll,
  onSettings,
  onHome,
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
          <button type="button" onClick={onHome} className="text-left hover:opacity-90 transition-opacity focus-ring rounded">
            <BrandLogo size="lg" variant="compact" />
          </button>
        ) : (
          <BrandLogo size="lg" variant="compact" />
        )}
      </div>

      <nav className="px-3 pt-3 shrink-0 space-y-1">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium focus-ring"
        >
          <LayoutDashboard size={16} className="text-emerald-400" />
          Overview
        </button>
        <button
          type="button"
          onClick={wrap(onSettings)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
        >
          <Settings size={16} />
          Settings
        </button>
      </nav>

      <div className="flex-1" />

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
