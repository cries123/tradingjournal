import type { ReactNode } from 'react';
import { BrandLogo } from './BrandLogo';
import { AuthPanel } from './AuthPanel';

interface MobileNavProps {
  onOpenMenu: () => void;
  onAddTrade: () => void;
  onImportScreenshot: () => void;
}

export function MobileHeader({
  onOpenMenu,
  onHome,
}: {
  onOpenMenu: () => void;
  onHome?: () => void;
}) {
  return (
    <header className="md:hidden shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-bg-secondary/90 backdrop-blur-md">
      <button
        type="button"
        onClick={onOpenMenu}
        className="p-2 rounded-lg hover:bg-bg-tertiary text-text-primary"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
      {onHome ? (
        <button type="button" onClick={onHome} className="flex-1 min-w-0 text-left">
          <BrandLogo size="sm" />
        </button>
      ) : (
        <div className="flex-1 min-w-0">
          <BrandLogo size="sm" />
        </div>
      )}
    </header>
  );
}

export function MobileBottomNav({ onOpenMenu, onAddTrade, onImportScreenshot }: MobileNavProps) {
  return (
    <nav className="shrink-0 z-40 border-t border-border/60 bg-bg-secondary/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 h-14">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center gap-0.5 text-text-secondary hover:text-text-primary"
        >
          <span className="text-lg">☰</span>
          <span className="text-[9px]">Menu</span>
        </button>
        <button
          type="button"
          onClick={onImportScreenshot}
          className="flex flex-col items-center justify-center gap-0.5 text-cyan-400"
        >
          <span className="text-lg">📷</span>
          <span className="text-[9px]">Screenshot</span>
        </button>
        <button
          type="button"
          onClick={onAddTrade}
          className="flex flex-col items-center justify-center"
        >
          <span className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-bg-primary text-xl font-light leading-none shadow-lg shadow-emerald-500/30">
            +
          </span>
        </button>
        <div className="flex items-center justify-center px-1">
          <div className="w-full max-w-[72px]">
            <AuthPanel compact />
          </div>
        </div>
      </div>
    </nav>
  );
}

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div className="md:hidden fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] shadow-2xl animate-slide-in">
        {children}
      </div>
    </>
  );
}
