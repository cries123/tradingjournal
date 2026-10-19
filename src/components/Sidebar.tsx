import {
  BadgeCheck,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  List,
  Search,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import type { Trade } from '../types';
import { BrandLogo } from './BrandLogo';
import { JournalList } from './nav/JournalList';
import { BrokerCard } from './nav/BrokerCard';
import { ProfileMenu } from './nav/ProfileMenu';
import { PlanNotice } from './plan/PlanBadge';
import { ACCOUNT_VIEWS } from './nav/views';
import { useAuth } from '../context/useAuth';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useSupportUnread } from '../hooks/useSupportUnread';
import { useCoachingCount } from '../hooks/useCoachingCount';

export type SidebarAppView =
  | 'dashboard'
  | 'trades'
  | 'day'
  | 'more'
  | 'settings'
  | 'brokers'
  | 'connect-broker'
  | 'performance'
  | 'simulator'
  | 'track-record'
  | 'assistant'
  | 'report-bug'
  | 'support'
  | 'coach'
  | 'account'
  | 'subscription'
  | 'order-history'
  | 'report';

interface SidebarProps {
  appView: SidebarAppView;
  onDashboard: () => void;
  onTrades?: () => void;
  onAddTrade: () => void;
  onConnectBroker: () => void;
  onPerformance: () => void;
  onSimulator: () => void;
  onTrackRecord: () => void;
  onAssistant: () => void;
  onSettings: () => void;
  onSupport: () => void;
  onCoach: () => void;
  onAccount?: () => void;
  onSubscription?: () => void;
  onOrderHistory?: () => void;
  /** Opens journal search. The sidebar is the only chrome on desktop, so search lives here. */
  onSearch?: () => void;
  onAdmin?: () => void;
  onHome?: () => void;
  /** Every trade in every journal, for each journal's overall P&L beside its name. */
  trades?: readonly Trade[];
  /** A trade in the journal came from a broker. */
  hasBrokerTrades?: boolean;
}

/**
 * One row of the nav.
 *
 * The active state is a filled pill with a bar down its left edge rather than a full outline. An
 * outlined box on every selected row made the panel read as a stack of separate cards; the bar
 * says "you are here" with one element instead of four borders, and it lines up down the column so
 * the eye finds the current view without reading any of the labels.
 */
function NavItem({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group relative w-full flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-lg text-[13px] transition-colors focus-ring ${
        active ? 'bg-accent/10 text-accent font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" aria-hidden />}
      <span className={`shrink-0 ${active ? 'text-accent' : ''}`}>{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="shrink-0 text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 bg-accent/20 text-accent">
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * The journal's navigation on desktop — the only chrome on the screen.
 *
 * Three parts, top to bottom: the places you look at your trading; the things you are looking at
 * (your journals, each with its overall P&L, and your broker with its Sync button); and you, with the
 * account behind your name. Settings, Support and Connect broker were nav rows of their own, which
 * made a list of destinations where three of the rows were errands. They now sit where each errand
 * starts: the broker card, and the menu behind the profile row.
 *
 * Phones do not get this panel in a drawer any more. They have a bottom bar and a More screen
 * (components/more/MoreContent), which shows the same journals and broker card at thumb size.
 */
export function Sidebar({
  appView,
  onDashboard,
  onTrades,
  onAddTrade,
  onConnectBroker,
  onPerformance,
  onSimulator,
  onTrackRecord,
  onAssistant,
  onSettings,
  onSupport,
  onCoach,
  onAccount,
  onSubscription,
  onOrderHistory,
  onSearch,
  onAdmin,
  onHome,
  trades,
  hasBrokerTrades = false,
}: SidebarProps) {
  const { user, loading, firebaseEnabled } = useAuth();
  const isAdmin = useIsAdmin('sidebar-admin-check');
  const supportUnread = useSupportUnread();
  const coaching = useCoachingCount();
  return (
    /* z-30, and no overflow clipping: the profile menu opens upward from the foot of the panel and
       wider than it, over the page, so the panel has to sit above the page and let it out. Its own
       scroll area still clips, so a short window scrolls the middle rather than spilling. */
    <aside className="relative z-30 flex flex-col w-56 shrink-0 sticky top-0 h-dvh gap-0.5 px-3.5 py-[18px] bg-bg-primary border-r border-white/[0.06]">
      <div className="flex items-center justify-between gap-2 px-2 pb-[18px] pt-1 shrink-0">
        {onHome ? (
          <button type="button" onClick={onHome} className="text-left hover:opacity-90 transition-opacity focus-ring rounded" title="Back to home">
            <BrandLogo size="sm" variant="compact" />
          </button>
        ) : (
          <BrandLogo size="sm" variant="compact" />
        )}
        {/* Search stays one click away. The approved design had no search on desktop; dropping a
            working feature to match a drawing is the one change not made. Ctrl/⌘K also opens it. */}
        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            aria-label="Search your journal"
            title="Search (Ctrl K / ⌘K)"
            className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-bg-tertiary/60 hover:text-text-primary transition-colors focus-ring"
          >
            <Search size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain no-scrollbar flex flex-col gap-0.5">
        <nav className="space-y-0.5" aria-label="Journal">
          <NavItem active={appView === 'dashboard' || appView === 'day'} onClick={onDashboard} icon={<LayoutDashboard size={16} />} label="Overview" />
          {onTrades && <NavItem active={appView === 'trades'} onClick={onTrades} icon={<List size={16} />} label="Trades" />}
          <NavItem active={appView === 'performance'} onClick={onPerformance} icon={<Gauge size={16} />} label="Performance" />
          {/* Next to Performance: both answer "what did my trading actually do", and this one is
              the only place that answers it about a version of the year that did not happen. */}
          <NavItem active={appView === 'simulator'} onClick={onSimulator} icon={<FlaskConical size={16} />} label="Rule simulator" />
          <NavItem active={appView === 'assistant'} onClick={onAssistant} icon={<Sparkles size={16} />} label="Assistant" />
          {/* Last of the analysis rows because it is the only one that produces something other
              people see. */}
          <NavItem active={appView === 'track-record'} onClick={onTrackRecord} icon={<BadgeCheck size={16} />} label="Track record" />
          {/* Only for the people who are actually somebody's coach — which is almost nobody. */}
          {coaching > 0 && (
            <NavItem
              active={appView === 'coach'}
              onClick={onCoach}
              icon={<UserRoundCheck size={16} />}
              label="Coaching"
              badge={coaching > 1 ? coaching : undefined}
            />
          )}
        </nav>

        <JournalList trades={trades} />

        <p className="pl-3 pt-4 pb-1.5 text-[10px] tracking-[0.12em] text-text-secondary/60">BROKER</p>
        <BrokerCard hasBrokerTrades={hasBrokerTrades} trades={trades} onConnectBroker={onConnectBroker} />
      </div>

      <div className="shrink-0 pt-3">
        <PlanNotice className="mb-2.5" />

        <button
          type="button"
          onClick={onAddTrade}
          className="w-full rounded-full bg-accent py-[11px] text-center text-[13px] font-bold text-bg-primary hover:opacity-90 transition-opacity focus-ring"
        >
          + Log trade
        </button>

        {firebaseEnabled && !loading && user && (
          <ProfileMenu
            onSettings={onSettings}
            onAccount={onAccount ?? onSettings}
            onSubscription={onSubscription ?? onSettings}
            onOrderHistory={onOrderHistory ?? onSettings}
            onSupport={onSupport}
            onAdmin={onAdmin}
            isAdmin={isAdmin}
            supportUnread={supportUnread}
            active={ACCOUNT_VIEWS.includes(appView)}
          />
        )}

        {firebaseEnabled && !loading && !user && (
          <p className="mt-2.5 text-[10px] text-text-secondary px-1">Sign in to sync across devices</p>
        )}

        {!firebaseEnabled && (
          <p className="mt-2.5 text-[10px] text-text-secondary px-1 leading-relaxed">Trades saved locally in this browser</p>
        )}
      </div>
    </aside>
  );
}