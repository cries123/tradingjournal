import { useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  BookOpenText,
  ChevronRight,
  CreditCard,
  FileText,
  FlaskConical,
  LifeBuoy,
  List,
  LogOut,
  Megaphone,
  Receipt,
  Settings,
  ShieldCheck,
  UserCog,
  UserRoundCheck,
} from 'lucide-react';
import type { Trade } from '../../types';
import { useAuth } from '../../context/useAuth';
import { useSupportUnread } from '../../hooks/useSupportUnread';
import { useCoachingCount } from '../../hooks/useCoachingCount';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { accountDisplayName, accountInitial } from '../../utils/accountName';
import { navigateToPath } from '../../utils/navigateToPath';
import { JournalList } from '../nav/JournalList';
import { BrokerCard } from '../nav/BrokerCard';
import { PlanBadge } from '../plan/PlanBadge';

interface MoreContentProps {
  trades: readonly Trade[];
  year: number;
  month: number;
  hasBrokerTrades: boolean;
  onConnectBroker: () => void;
  onTrades?: () => void;
  onSimulator: () => void;
  onTrackRecord: () => void;
  onReport: () => void;
  onCoach: () => void;
  onSettings: () => void;
  onAccount: () => void;
  onSubscription: () => void;
  onOrderHistory: () => void;
  onSupport: () => void;
  onAdmin?: () => void;
}

function Row({ icon, label, onClick, badge }: { icon: ReactNode; label: string; onClick: () => void; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-[15px] text-text-primary hover:bg-bg-tertiary/50 transition-colors focus-ring"
    >
      <span className="shrink-0 text-text-secondary">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="shrink-0 text-[11px] font-semibold tabular-nums rounded-full px-2 py-0.5 bg-accent/20 text-accent">
          {badge} new
        </span>
      )}
      <ChevronRight size={16} className="shrink-0 text-text-secondary/60" aria-hidden />
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-1 pb-2 text-[13px] font-semibold text-text-secondary">{title}</h2>
      <div className="panel-card overflow-hidden divide-y divide-border/50 p-0">{children}</div>
    </section>
  );
}

/**
 * Everything a phone does not keep in its bottom bar, as a page.
 *
 * Ordered by how often each thing is reached for: who you are and what you pay, the broker (with
 * Sync), the journals (each with its month, so switching is a decision rather than a lookup), the
 * other places to look at your trading, then the account and help screens, and sign-out alone at
 * the very bottom where it cannot be hit on the way to anything else.
 */
export function MoreContent({
  trades,
  year,
  month,
  hasBrokerTrades,
  onConnectBroker,
  onTrades,
  onSimulator,
  onTrackRecord,
  onReport,
  onCoach,
  onSettings,
  onAccount,
  onSubscription,
  onOrderHistory,
  onSupport,
  onAdmin,
}: MoreContentProps) {
  const { user, username, logout, firebaseEnabled } = useAuth();
  const supportUnread = useSupportUnread();
  const coaching = useCoachingCount();
  const isAdmin = useIsAdmin('more-admin-check');
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-1 pt-2 pb-4">
      <h1 className="text-2xl font-bold tracking-tight px-1">More</h1>

      {user && (
        <section className="panel-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">
              {accountInitial(username, user)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{username ? `@${username}` : accountDisplayName(username, user)}</p>
              {user.email && <p className="truncate text-[13px] text-text-secondary">{user.email}</p>}
            </div>
          </div>
          {/* The plan card names the plan itself, with the day's allowances and any trial or payment
              notice — so no second plan pill beside the name. */}
          <div className="mt-4">
            <PlanBadge />
          </div>
        </section>
      )}

      <section>
        <h2 className="px-1 pb-2 text-[13px] font-semibold text-text-secondary">Broker</h2>
        <BrokerCard hasBrokerTrades={hasBrokerTrades} onConnectBroker={onConnectBroker} size="comfortable" />
      </section>

      <section className="panel-card p-2">
        <JournalList trades={trades} year={year} month={month} size="comfortable" />
      </section>

      <Group title="Your trading">
        {onTrades && <Row icon={<List size={18} />} label="All trades" onClick={onTrades} />}
        <Row icon={<FlaskConical size={18} />} label="Rule simulator" onClick={onSimulator} />
        <Row icon={<BadgeCheck size={18} />} label="Track record" onClick={onTrackRecord} />
        <Row icon={<FileText size={18} />} label="Monthly report" onClick={onReport} />
        {coaching > 0 && <Row icon={<UserRoundCheck size={18} />} label="Coaching" onClick={onCoach} />}
      </Group>

      <Group title="Account">
        <Row icon={<Settings size={18} />} label="Settings" onClick={onSettings} />
        <Row icon={<UserCog size={18} />} label="Account settings" onClick={onAccount} />
        <Row icon={<CreditCard size={18} />} label="Subscription" onClick={onSubscription} />
        <Row icon={<Receipt size={18} />} label="Order history" onClick={onOrderHistory} />
      </Group>

      <Group title="Help">
        <Row icon={<LifeBuoy size={18} />} label="Support" onClick={onSupport} badge={supportUnread} />
        <Row icon={<BookOpenText size={18} />} label="Help center" onClick={() => navigateToPath('/help-center')} />
        <Row icon={<Megaphone size={18} />} label="What's new" onClick={() => navigateToPath('/whats-new')} />
        {isAdmin && onAdmin && <Row icon={<ShieldCheck size={18} />} label="Admin" onClick={onAdmin} />}
      </Group>

      {firebaseEnabled && user && (
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="w-full flex items-center justify-center gap-2 min-h-[52px] rounded-xl border border-border text-[15px] font-medium text-loss-bright hover:bg-loss/10 transition-colors disabled:opacity-60 focus-ring"
        >
          <LogOut size={17} aria-hidden />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      )}
    </div>
  );
}
