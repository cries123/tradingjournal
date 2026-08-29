import type { ReactNode } from 'react';
import { LayoutGrid, Menu, MessageCircle, Plus, Trophy } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import type { SidebarAppView } from './Sidebar';

interface MobileNavProps {
  appView: SidebarAppView;
  onOpenMenu: () => void;
  onAddTrade: () => void;
  onDashboard: () => void;
  onLeaderboard: () => void;
  onAssistant: () => void;
  assistantOpen: boolean;
}

/**
 * Slim branding strip.
 *
 * The hamburger that used to live here is gone: it opened the same drawer as the bottom bar's
 * Menu button 100px below it, and duplicating a control at the top of a phone screen — the part
 * of the display a thumb can't comfortably reach — while the same control sits in the thumb zone
 * is the wrong one to keep. The logo shrank and the tagline dropped with it, because this bar was
 * spending 16% of an 844px viewport restating the name of an app the user deliberately opened.
 */
export function MobileHeader({ onHome }: { onHome?: () => void }) {
  return (
    <header className="md:hidden shrink-0 flex items-center px-3 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] border-b border-border/60 bg-bg-secondary/90 backdrop-blur-md">
      {onHome ? (
        <button type="button" onClick={onHome} className="min-w-0 text-left focus-ring rounded">
          <BrandLogo size="sm" variant="compact" />
        </button>
      ) : (
        <div className="min-w-0">
          <BrandLogo size="sm" variant="compact" />
        </div>
      )}
    </header>
  );
}

interface NavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 focus-ring transition-colors ${
        active ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {/* Marks the current section. The old bar had no active state at all, so it could never
          answer the first question a nav bar exists to answer: where am I? */}
      {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
      {icon}
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  );
}

/**
 * The app's primary navigation on phones.
 *
 * Rebuilt around actual destinations. The previous version held Menu, Broker, a "+" and a
 * sign-out button, which meant three of its four slots were wrong for a nav bar:
 *
 *   - Menu duplicated the header's hamburger directly above it.
 *   - Broker was a permanent slot for a one-time setup task — dead weight forever once connected.
 *   - The fourth slot rendered AuthPanel, i.e. a LOG OUT button labelled "Out", sitting a
 *     thumb-width from "+". Miss the add-trade button and you signed yourself out. Signed-out
 *     users got nothing there at all, which is why the bar looked half-finished.
 *
 * None of them indicated the current view, and the bar was only mounted on the dashboard, so it
 * disappeared the moment you navigated anywhere. Sign-out now lives in the drawer with the rest
 * of the account controls.
 */
export function MobileBottomNav({
  appView,
  onOpenMenu,
  onAddTrade,
  onDashboard,
  onLeaderboard,
  onAssistant,
  assistantOpen,
}: MobileNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="shrink-0 z-40 border-t border-border/60 bg-bg-secondary/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-14">
        <NavItem
          icon={<LayoutGrid size={18} />}
          label="Overview"
          active={appView === 'dashboard'}
          onClick={onDashboard}
        />
        <NavItem
          icon={<Trophy size={18} />}
          label="Ranks"
          active={appView === 'leaderboard'}
          onClick={onLeaderboard}
        />

        <button
          type="button"
          onClick={onAddTrade}
          aria-label="Log a trade"
          className="flex flex-col items-center justify-center focus-ring"
        >
          <span className="w-11 h-11 rounded-full bg-gradient-to-br from-profit-bright to-accent flex items-center justify-center text-bg-primary shadow-lg shadow-profit-bright/30">
            <Plus size={24} strokeWidth={2.5} />
          </span>
        </button>

        <NavItem
          icon={<MessageCircle size={18} />}
          label="Ask"
          active={assistantOpen}
          onClick={onAssistant}
        />
        <NavItem icon={<Menu size={18} />} label="More" onClick={onOpenMenu} />
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
  useEscapeToClose(onClose);
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
