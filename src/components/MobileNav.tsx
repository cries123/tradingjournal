import type { ReactNode } from 'react';
import { Gauge, LayoutGrid, Menu, MessageCircle, Plus } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { SidebarAppView } from './Sidebar';
import { MORE_VIEWS } from './nav/views';

interface MobileNavProps {
  appView: SidebarAppView;
  /** Opens the More screen. */
  onMore: () => void;
  onAddTrade: () => void;
  onDashboard: () => void;
  onPerformance: () => void;
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
export function MobileHeader({
  onHome,
  account,
}: {
  onHome?: () => void;
  /** The account dropdown. Optional so the header still renders where there is no journal to open. */
  account?: ReactNode;
}) {
  return (
    /*
      relative z-40 is load-bearing, not decoration. The account dropdown is absolutely positioned
      inside this header and hangs down over <main>, which is a LATER sibling in the flex column —
      so without a stacking context here the dashboard's panel-cards paint over it and the open
      menu shows up as a ghost behind the calendar. The panel's own z-50 cannot fix that from
      inside; the header is what has to out-rank main.
    */
    <header className="md:hidden relative z-40 shrink-0 flex items-center gap-2 px-3 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] border-b border-border/60 bg-bg-secondary/90 backdrop-blur-md">
      {onHome ? (
        <button type="button" onClick={onHome} className="min-w-0 text-left focus-ring rounded">
          <BrandLogo size="sm" variant="compact" />
        </button>
      ) : (
        <div className="min-w-0">
          <BrandLogo size="sm" variant="compact" />
        </div>
      )}

      {/* Pushed to the trailing edge, opposite the logo — the same corner the marketing nav puts
          it in, so the control does not move when somebody crosses between the two. */}
      {account && <div className="ml-auto shrink-0">{account}</div>}
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
      {/* Truncating rather than wrapping: a two-line label in a 56px-tall bar pushes the icon
          out of alignment with its neighbours, and one column growing taller than the rest is
          more noticeable than a clipped word. */}
      <span className="w-full px-0.5 text-center text-[10px] font-medium leading-none truncate">
        {label}
      </span>
    </button>
  );
}

/**
 * The app's primary navigation on phones.
 *
 * Four destinations and the button that matters most, with More as a screen of its own rather than
 * the desktop sidebar squeezed into a drawer. The drawer was a 280px column of the same rows the
 * sidebar has, built for a mouse — Sign out sat a few millimetres under Support — and it covered the
 * screen it was opened from without being somewhere you could come back to. More is a page: it has
 * a back, it holds the journals and the broker at thumb size, and every screen it leads to keeps
 * More lit in this bar so the way back is never in doubt.
 *
 * Sign-out lives at the bottom of More, alone, where it cannot be hit on the way to anything else —
 * an earlier version of this bar put a LOG OUT button a thumb-width from "+".
 */
export function MobileBottomNav({
  appView,
  onMore,
  onAddTrade,
  onDashboard,
  onPerformance,
  onAssistant,
  assistantOpen,
}: MobileNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="shrink-0 z-40 border-t border-border/60 bg-bg-secondary/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      {/* Five columns, five children. It briefly had four in a five-column grid — a leftover
          from removing the leaderboard — which pushed "+" off center and left a visible hole
          somebody reasonably read as a missing button. */}
      <div className="grid grid-cols-5 h-[60px]">
        <NavItem
          icon={<LayoutGrid size={20} />}
          label="Overview"
          active={appView === 'dashboard' || appView === 'day'}
          onClick={onDashboard}
        />
        {/* Performance, not something quieter, because it is the screen the paid plans are for —
            and because the two destinations either side of "+" are the ones a thumb reaches
            without moving, so they should be the two people open most. */}
        <NavItem
          icon={<Gauge size={20} />}
          label="Performance"
          active={appView === 'performance'}
          onClick={onPerformance}
        />
        {/*
          The plus sits INSIDE the bar: 48px in a 60px bar, centred by the grid cell, no negative
          margin and no transform. A button that rides up over the bar's top edge looks like a
          floating action button, overlaps whatever the screen has at its bottom — the last calendar
          row, the send box on Ask — and on an iPhone with the home indicator the part above the bar
          is the part a thumb misses. bottomNavFit.test.ts holds it to this.
        */}
        <button
          type="button"
          onClick={onAddTrade}
          aria-label="Log a trade"
          className="flex items-center justify-center focus-ring"
        >
          <span className="w-12 h-12 rounded-full bg-gradient-to-br from-profit-bright to-accent flex items-center justify-center text-bg-primary shadow-md shadow-profit-bright/25">
            <Plus size={24} strokeWidth={2.5} />
          </span>
        </button>

        {/* Goes to the Assistant tab, not the sheet. On a phone the dock filled the screen
            anyway, so the sheet was a full-page view pretending not to be one — and it had no
            room for the saved conversations. */}
        <NavItem
          icon={<MessageCircle size={20} />}
          label="Ask"
          active={assistantOpen || appView === 'assistant'}
          onClick={onAssistant}
        />
        <NavItem icon={<Menu size={20} />} label="More" active={MORE_VIEWS.includes(appView)} onClick={onMore} />
      </div>
    </nav>
  );
}
