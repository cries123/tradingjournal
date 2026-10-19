import { useState, type ReactNode } from 'react';
import {
  Bell,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  FileText,
  FlaskConical,
  LifeBuoy,
  LogOut,
  Award,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import type { Trade } from '../../types';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { useSupportUnread } from '../../hooks/useSupportUnread';
import { useCoachingCount } from '../../hooks/useCoachingCount';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { TIER_PLANS } from '../../config/tiers';
import { BUILD_SHA } from '../../config/build';
import { accountDisplayName, accountInitial } from '../../utils/accountName';
import { navigateToPath } from '../../utils/navigateToPath';
import { JournalList } from '../nav/JournalList';
import { BrokerCard } from '../nav/BrokerCard';
import { PLAN_PILL, planLine } from '../nav/planPill';
import { PlanNotice } from '../plan/PlanBadge';

interface MoreContentProps {
  trades: readonly Trade[];
  year: number;
  month: number;
  hasBrokerTrades: boolean;
  onConnectBroker: () => void;
  onSimulator: () => void;
  onTrackRecord: () => void;
  onReport: () => void;
  onCoach: () => void;
  onSettings: () => void;
  onSubscription: () => void;
  onOrderHistory: () => void;
  onSupport: () => void;
  onAdmin?: () => void;
}

function Row({
  icon,
  label,
  onClick,
  value,
  badge,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  value?: string;
  badge?: string;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-left text-[15px] hover:bg-white/[0.03] focus-ring [&+&]:border-t [&+&]:border-white/[0.07] ${
        tone === 'danger' ? 'text-loss-bright' : 'text-text-primary'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
          tone === 'danger' ? 'bg-loss/10 text-loss-bright' : 'bg-[#1c1c1c] text-text-secondary'
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value && <span className="shrink-0 whitespace-nowrap text-[13px] text-text-secondary">{value}</span>}
      {badge && <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-400">{badge}</span>}
      {tone !== 'danger' && <ChevronRight size={16} className="shrink-0 text-text-secondary/60" aria-hidden />}
    </button>
  );
}

function Group({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="mx-1 mt-5 mb-2 text-[13px] font-bold text-text-secondary">{title}</h2>}
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-bg-card">{children}</div>
    </section>
  );
}

/**
 * Everything a phone does not keep in its bottom bar, as a page.
 *
 * Ordered by how often each thing is reached for: who you are and what you pay, the broker (with
 * Sync), the journals (each with its month, so switching is a decision rather than a lookup), the
 * tools, then the account and help screens, and sign-out alone at the very bottom where it cannot be
 * hit on the way to anything else. Account settings stay behind the avatar in the header, where
 * they have always been on a phone.
 */
export function MoreContent({
  trades,
  year,
  month,
  hasBrokerTrades,
  onConnectBroker,
  onSimulator,
  onTrackRecord,
  onReport,
  onCoach,
  onSettings,
  onSubscription,
  onOrderHistory,
  onSupport,
  onAdmin,
}: MoreContentProps) {
  const { user, username, logout, firebaseEnabled } = useAuth();
  const { tier, loaded, currentPeriodEnd, source } = useEntitlement();
  const supportUnread = useSupportUnread();
  const coaching = useCoachingCount();
  const isAdmin = useIsAdmin('more-admin-check');
  const [signingOut, setSigningOut] = useState(false);
  const monthName = new Date(year, month, 15).toLocaleDateString('en-US', { month: 'long' });

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-0.5 pb-4">
      <h1 className="mt-2.5 mb-3.5 text-[26px] font-extrabold tracking-tight">More</h1>

      {user && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-bg-card p-3.5">
          <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[#1f2a18] text-lg font-bold text-accent">
            {accountInitial(username, user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{username ? `@${username}` : accountDisplayName(username, user)}</p>
            {user.email && <p className="mt-px truncate text-[13px] text-text-secondary">{user.email}</p>}
          </div>
          <div className="shrink-0 text-right">
            {loaded && <span className={`inline-block rounded-full px-2.5 py-[3px] text-xs font-bold ${PLAN_PILL[tier]}`}>{TIER_PLANS[tier].name}</span>}
            <button type="button" onClick={onSubscription} className="mt-[5px] block w-full text-right text-xs text-accent focus-ring rounded">
              Manage
            </button>
          </div>
        </div>
      )}
      {/* Only when there is something to say — a trial about to charge, a failed payment. */}
      <PlanNotice className="mt-3" />

      <h2 className="mx-1 mt-5 mb-2 text-[13px] font-bold text-text-secondary">Broker</h2>
      <BrokerCard variant="more" hasBrokerTrades={hasBrokerTrades} trades={trades} onConnectBroker={onConnectBroker} />

      <JournalList variant="more" trades={trades} year={year} month={month} />

      <Group title="Tools">
        <Row icon={<FlaskConical size={18} />} label="Rule simulator" onClick={onSimulator} />
        <Row icon={<Award size={18} />} label="Track record" onClick={onTrackRecord} />
        <Row icon={<FileText size={18} />} label="Monthly report" value={monthName} onClick={onReport} />
        {coaching > 0 && <Row icon={<UserRoundCheck size={18} />} label="Coaching" onClick={onCoach} />}
      </Group>

      <Group title="Account">
        <Row icon={<Settings size={18} />} label="Settings" value="Rules, playbook, accent" onClick={onSettings} />
        <Row
          icon={<CreditCard size={18} />}
          label="Subscription"
          value={loaded ? planLine(TIER_PLANS[tier].name, currentPeriodEnd, tier !== 'free' && source === 'purchase') : undefined}
          onClick={onSubscription}
        />
        <Row icon={<Receipt size={18} />} label="Order history" onClick={onOrderHistory} />
        <Row icon={<Bell size={18} />} label="Emails" value="Recaps and alerts" onClick={onSettings} />
        <Row icon={<Download size={18} />} label="Export & backup" value="CSV, tax year" onClick={onSettings} />
        {isAdmin && onAdmin && <Row icon={<ShieldCheck size={18} />} label="Admin" onClick={onAdmin} />}
      </Group>

      <Group title="Help">
        <Row icon={<LifeBuoy size={18} />} label="Support" badge={supportUnread > 0 ? `${supportUnread} new` : undefined} onClick={onSupport} />
        <Row icon={<CircleHelp size={18} />} label="Help center" onClick={() => navigateToPath('/help-center')} />
        <Row icon={<Sparkles size={18} />} label="What's new" onClick={() => navigateToPath('/whats-new')} />
      </Group>

      {firebaseEnabled && user && (
        <Group className="mt-[22px]">
          <Row icon={<LogOut size={18} />} label={signingOut ? 'Signing out…' : 'Sign out'} tone="danger" onClick={() => void signOut()} />
        </Group>
      )}

      <p className="mt-[18px] text-center text-xs leading-relaxed text-text-secondary">
        {firebaseEnabled && user ? 'Your journal is saved to your account' : 'Your journal is saved in this browser'}
        <br />
        Trend Chasers · build {BUILD_SHA}
      </p>
    </div>
  );
}
