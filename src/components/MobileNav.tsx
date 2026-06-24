import type { ReactNode } from 'react';
import { AuthPanel } from './AuthPanel';

interface MobileNavProps {
  onOpenMenu: () => void;
  onAddTrade: () => void;
  onImportScreenshot: () => void;
}

export function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="md:hidden shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-border bg-bg-secondary">
      <button
        type="button"
        onClick={onOpenMenu}
        className="p-2 -ml-1 rounded-md hover:bg-bg-tertiary text-text-primary"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-bold truncate">Trading Journal</h1>
        <p className="text-[10px] text-text-secondary">Daily P&L</p>
      </div>
    </header>
  );
}

export function MobileBottomNav({ onOpenMenu, onAddTrade, onImportScreenshot }: MobileNavProps) {
  return (
    <nav className="shrink-0 z-40 border-t border-border bg-bg-secondary pb-[env(safe-area-inset-bottom)]">
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
          className="flex flex-col items-center justify-center gap-0.5 text-accent"
        >
          <span className="text-lg">📷</span>
          <span className="text-[9px]">Screenshot</span>
        </button>
        <button
          type="button"
          onClick={onAddTrade}
          className="flex flex-col items-center justify-center gap-0.5 text-white"
        >
          <span className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-xl font-light leading-none">
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
        className="md:hidden fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div className="md:hidden fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] shadow-2xl animate-slide-in">
        {children}
      </div>
    </>
  );
}
