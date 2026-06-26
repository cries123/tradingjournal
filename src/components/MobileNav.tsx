import type { ReactNode } from 'react';
import { Camera, Menu, Plus } from 'lucide-react';
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
    <header className="md:hidden shrink-0 flex items-center gap-2 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] border-b border-border/60 bg-bg-secondary/90 backdrop-blur-md">
      <button
        type="button"
        onClick={onOpenMenu}
        className="p-2 rounded-lg hover:bg-bg-tertiary text-text-primary focus-ring"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      {onHome ? (
        <button type="button" onClick={onHome} className="flex-1 min-w-0 text-left focus-ring rounded">
          <BrandLogo size="md" variant="compact" />
        </button>
      ) : (
        <div className="flex-1 min-w-0">
          <BrandLogo size="md" variant="compact" />
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
          className="flex flex-col items-center justify-center gap-0.5 text-text-secondary hover:text-text-primary focus-ring"
        >
          <Menu size={18} />
          <span className="text-[9px]">Menu</span>
        </button>
        <button
          type="button"
          onClick={onImportScreenshot}
          className="flex flex-col items-center justify-center gap-0.5 text-cyan-400 focus-ring"
        >
          <Camera size={18} />
          <span className="text-[9px]">Screenshot</span>
        </button>
        <button
          type="button"
          onClick={onAddTrade}
          className="flex flex-col items-center justify-center focus-ring"
        >
          <span className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-bg-primary shadow-lg shadow-emerald-500/30">
            <Plus size={22} strokeWidth={2.5} />
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
        className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div className="md:hidden fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] shadow-2xl animate-slide-in motion-safe:animate-slide-in">
        {children}
      </div>
    </>
  );
}
