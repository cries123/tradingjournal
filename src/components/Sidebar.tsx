import { useState } from 'react';
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
  /** Every trade in every journal, for each journal's month beside its name. */
  trades?: readonly Trade[];
  /** The month on screen, which is the month each journal's figure is for. */
  year?: number;
  month?: number;
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
 * (your journals, each with its month, and your broker with its Sync button); and you, with the
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
  year,
  month,
  hasBrokerTrades = false,
}: SidebarProps) {
  const { user, loading, firebaseEnabled } = useAuth();
  const isAdmin = useIsAdmin('sidebar-admin-check');
  const supportUnread = useSupportUnread();
  const coaching = useCoachingCount();
  // The month on screen when the caller says which; otherwise this one. Read once, not in render.
  const [opened] = useState(() => new Date());
  const shownYear = year ?? opened.getFullYear();
  const shownMonth = month ?? opened.getMonth();
  // ⌘ on a Mac, Ctrl everywhere else — the hint should name the key the reader will press.
  const [mac] = useState(() => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent));

  return (
    <aside className="flex flex-col w-56 shrink-0 sticky top-0 h-dvh bg-bg-secondary/80 backdrop-blur-xl border-r border-border/60 overflow-hidden">
      {/* md, not lg: at 224px wide the large mark forced the wordmark to wrap. */}
      <div className="px-4 py-3 border-b border-border/60 shrink-0">
        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            className="text-left hover:opacity-90 transition-opacity focus-ring rounded"
            title="Back to home"
          >
            <BrandLogo size="md" variant="compact" />
          </button>
        ) : (
          <BrandLogo size="md" variant="compact" />
        )}
      </div>

      {/* Still scrollable — a 600px-tall window will always be able to run out of room — but
          without the drawn rail. See .no-scrollbar in index.css. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain no-scrollbar">
        {onSearch && (
          <div className="px-2.5 pt-3">
            <button
              type="button"
              onClick={onSearch}
              className="w-full flex items-center gap-2 rounded-lg border border-border/70 bg-bg-tertiary/40 px-3 py-1.5 text-[13px] text-text-secondary hover:text-text-primary hover:border-border transition-colors focus-ring"
            >
              <Search size={14} aria-hidden />
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-border px-1 text-[10px] font-sans text-text-secondary">{mac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
          </div>
        )}

        <nav className="px-2.5 pt-3 space-y-0.5" aria-label="Journal">
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

        <div className="px-2.5 pt-5">
          <JournalList trades={trades} year={shownYear} month={shownMonth} />
        </div>

        <div className="px-2.5 pt-5 pb-3">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary/60">Broker</p>
          <BrokerCard hasBrokerTrades={hasBrokerTrades} onConnectBroker={onConnectBroker} />
        </div>
      </div>

      <div className="p-3 border-t border-border/60 shrink-0 space-y-2.5">
        <PlanNotice />

        <button type="button" onClick={onAddTrade} className="w-full py-2.5 btn-primary text-sm font-semibold">
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
          <p className="text-[10px] text-text-secondary px-1">Sign in to sync across devices</p>
        )}

        {!firebaseEnabled && (
          <p className="text-[10px] text-text-secondary px-1 leading-relaxed">Trades saved locally in this browser</p>
        )}
      </div>
    </aside>
  );
}
