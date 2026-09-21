import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Link2,
  Settings,
  Gauge,
  UserRoundCheck,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  FlaskConical,
  BadgeCheck,
} from 'lucide-react';
import { PlanBadge } from './plan/PlanBadge';
import { BrandLogo } from './BrandLogo';
import { SidebarJournalPicker } from './SidebarJournalPicker';
import { useAuth } from '../context/useAuth';
import { isCurrentUserAdmin } from '../services/admin';
import { useSupportUnread } from '../hooks/useSupportUnread';
import { useCoachingCount } from '../hooks/useCoachingCount';

export type SidebarAppView =
  | 'dashboard'
  | 'settings'
  | 'brokers'
  | 'connect-broker'
  | 'performance'
  | 'simulator'
  | 'track-record'
  | 'assistant'
  | 'report-bug'
  | 'request-broker'
  | 'support'
  | 'coach'
  | 'account'
  | 'subscription'
  | 'order-history';

interface SidebarProps {
  appView: SidebarAppView;
  onDashboard: () => void;
  onAddTrade: () => void;
  onConnectBroker: () => void;
  onPerformance: () => void;
  onSimulator: () => void;
  onTrackRecord: () => void;
  onAssistant: () => void;
  onSettings: () => void;
  onSupport: () => void;
  onCoach: () => void;
  onAdmin?: () => void;
  onHome?: () => void;
  variant?: 'desktop' | 'drawer';
  onNavigate?: () => void;
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
  tone = 'default',
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  tone?: 'default' | 'admin';
}) {
  const base =
    'group relative w-full flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-lg text-[13px] transition-colors focus-ring';
  const state = active
    ? 'bg-accent/10 text-accent font-medium'
    : tone === 'admin'
      ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10'
      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60';

  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`} aria-current={active ? 'page' : undefined}>
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" aria-hidden />
      )}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary/45">
      {children}
    </p>
  );
}

/**
 * The journal's navigation.
 *
 * It used to carry eleven destinations, which is what put a scrollbar down the side of a 224px
 * panel on any laptop screen — and a rail beside eight items is most of the ornament in the panel.
 * The fix was not a shorter scroll but fewer places: supported brokers, reporting a bug and
 * requesting a broker were three separate rows for three halves of the same errand, and they now
 * live as sections inside Support. Clearing the journal moved to Settings, where the rest of the
 * destructive controls already are, and Share month was always a duplicate of the button in the
 * dashboard toolbar.
 *
 * What's left is grouped by what a row is for: the four places you look at your trading, then the
 * journal you're looking at, then the three places you go to change something about the account.
 */
export function Sidebar({
  appView,
  onDashboard,
  onAddTrade,
  onConnectBroker,
  onPerformance,
  onSimulator,
  onTrackRecord,
  onAssistant,
  onSettings,
  onSupport,
  onCoach,
  onAdmin,
  onHome,
  variant = 'desktop',
  onNavigate,
}: SidebarProps) {
  const { user, loading, firebaseEnabled, logout, username } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const supportUnread = useSupportUnread();
  const coaching = useCoachingCount();

  useEffect(() => {
    if (!user?.uid || !firebaseEnabled) {
      // Clearing state before the fetch or subscription below. This is the external-system sync
      // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
      // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
      // rule rather than to fix a bug.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      {/* md, not lg: at 224px wide the large mark forced the wordmark to wrap and ate the top of
          the panel. The brand still reads first, it just stops being the loudest thing here. */}
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

      {/* Still scrollable — a 600px-tall window or a drawer on a small phone will always be able
          to run out of room — but without the drawn rail. See .no-scrollbar in index.css. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain no-scrollbar">
        <nav className="px-2.5 pt-3 space-y-0.5">
          <NavItem
            active={appView === 'dashboard'}
            onClick={wrap(onDashboard)}
            icon={<LayoutDashboard size={16} />}
            label="Overview"
          />
          <NavItem
            active={appView === 'performance'}
            onClick={wrap(onPerformance)}
            icon={<Gauge size={16} />}
            label="Performance"
          />
          {/* Next to Performance: both answer "what did my trading actually do", and this one is
              the only place that answers it about a version of the year that did not happen. */}
          <NavItem
            active={appView === 'simulator'}
            onClick={wrap(onSimulator)}
            icon={<FlaskConical size={16} />}
            label="Rule simulator"
          />
          <NavItem
            active={appView === 'assistant'}
            onClick={wrap(onAssistant)}
            icon={<Sparkles size={16} />}
            label="Assistant"
          />
          {/* Last of the analysis rows because it is the only one that produces something
              other people see — it belongs after the screens that decide whether there is
              anything worth showing them. */}
          <NavItem
            active={appView === 'track-record'}
            onClick={wrap(onTrackRecord)}
            icon={<BadgeCheck size={16} />}
            label="Track record"
          />
          {/* Only for the people who are actually somebody's coach — which is almost nobody, and a
              permanent row saying "nobody has invited you" is a nav item advertising a feature
              rather than doing anything. */}
          {coaching > 0 && (
            <NavItem
              active={appView === 'coach'}
              onClick={wrap(onCoach)}
              icon={<UserRoundCheck size={16} />}
              label="Coaching"
              badge={coaching > 1 ? coaching : undefined}
            />
          )}
        </nav>

        {/* No section label above this one: the picker draws its own "Journal" heading. */}
        <div className="px-2.5 pt-4">
          <SidebarJournalPicker onNavigate={onNavigate} />
        </div>

        <div className="px-2.5 pt-4 pb-3">
          <SectionLabel>Account</SectionLabel>
          <div className="space-y-0.5">
            <NavItem
              active={appView === 'connect-broker'}
              onClick={wrap(onConnectBroker)}
              icon={<Link2 size={16} />}
              label="Connect broker"
            />
            <NavItem
              active={appView === 'settings'}
              onClick={wrap(onSettings)}
              icon={<Settings size={16} />}
              label="Settings"
            />
            <NavItem
              active={appView === 'support' || appView === 'brokers' || appView === 'report-bug' || appView === 'request-broker'}
              onClick={wrap(onSupport)}
              icon={<LifeBuoy size={16} />}
              label="Support"
              /* A reply nobody opens is the same as no reply, and there is no email going out. */
              badge={supportUnread}
            />
            {isAdmin && onAdmin && (
              <NavItem
                active={false}
                onClick={wrap(onAdmin)}
                icon={<ShieldCheck size={16} />}
                label="Admin"
                tone="admin"
              />
            )}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border/60 shrink-0 space-y-3">
        <PlanBadge />

        <button type="button" onClick={wrap(onAddTrade)} className="w-full py-2.5 btn-primary text-sm font-semibold">
          + Log Trade
        </button>

        {/*
          Identity only. Account settings, Subscription and Order history used to sit under this
          row and have moved into the account dropdown in the top bar — the same control, in the
          same corner, as the one in the marketing nav. Three more rows at the bottom of a panel
          that already ends in a plan card, a Log Trade button and an email address was the
          quietest possible place to put the billing screens.
        */}
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
      </div>
    </aside>
  );
}
