import { useState } from 'react';
import {
  Bug,
  Building2,
  CreditCard,
  LifeBuoy,
  Link2,
  Plug,
  Sparkles,
} from 'lucide-react';
import { TIER_PLANS } from '../../config/tiers';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { goToPricing } from '../../utils/navigateToPath';
import type { TicketCategory } from '../../services/supportTickets';
import { SupportTicketsContent } from './SupportTicketsContent';
import { PageFrame } from '../layout/PageFrame';

interface SupportDashboardProps {
  onBack: () => void;
  /** Opens the supported-brokers list, which is still its own screen. */
  onBrokers: () => void;
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One fact about the account, in the shape support would ask for it. */
function Fact({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-lg bg-bg-primary/50 border border-border/40 p-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-secondary">
        <span className="text-accent/70 shrink-0">{icon}</span>
        {label}
      </p>
      <p className="text-sm font-semibold mt-1 truncate" title={value}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  blurb,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-border/60 bg-bg-tertiary/25 p-3 hover:border-accent/40 hover:bg-bg-tertiary/50 transition-colors focus-ring"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent mb-2">
        {icon}
      </span>
      <p className="text-[13px] font-semibold">{label}</p>
      <p className="text-[11px] text-text-secondary leading-snug mt-0.5">{blurb}</p>
    </button>
  );
}

/**
 * Support, as one screen instead of four.
 *
 * "Supported brokers", "Report a bug" and "Request broker" were three sidebar rows for three
 * halves of the same errand, and none of them told support anything about the account they were
 * being asked about. This puts the answer to "what plan are you on, and what's left of today"
 * above the conversation, so the first two messages of every thread stop being us asking and them
 * looking it up.
 *
 * The tickets themselves are unchanged — same threads, same live replies. What is new is the
 * context above them and the four ways in, each of which opens a ticket already filed under the
 * right category rather than making somebody choose from a dropdown they have not read.
 */
export function SupportDashboard({ onBack, onBrokers }: SupportDashboardProps) {
  const { user, username } = useAuth();
  const {
    tier,
    limits,
    usage,
    status,
    source,
    currentPeriodEnd,
    complimentaryUntil,
    onTrial,
    trialEndsAt,
    loaded,
  } = useEntitlement();

  /* A counter, not just a category: choosing "Report a bug" twice in a row has to reopen the form
     the second time, and a bare category would be the same value and remount nothing. */
  const [compose, setCompose] = useState<{ category: TicketCategory; n: number } | null>(null);
  const startTicket = (category: TicketCategory) =>
    setCompose((prev) => ({ category, n: (prev?.n ?? 0) + 1 }));

  const plan = TIER_PLANS[tier];
  const renewal = shortDate(currentPeriodEnd);
  const compUntil = shortDate(complimentaryUntil);
  // A trial's first charge is not a renewal, and this screen called it one. The date is the same
  // currentPeriodEnd either way, so only the word was wrong — on the one line that shows it.
  const trialEnd = shortDate(trialEndsAt);

  const planHint =
    source === 'admin'
      ? 'Granted to your account'
      : onTrial && trialEnd
        ? `Free trial — ${plan.price} on ${trialEnd}`
        : source === 'comp' && compUntil
          ? `On us through ${compUntil}`
          : status === 'past_due'
            ? 'Last payment did not go through'
            : status === 'canceled' && renewal
              ? `Access ends ${renewal}`
              : renewal
                ? `Renews ${renewal}`
                : null;

  const syncsLeft = Math.max(0, limits.syncsPerDay - usage.syncsUsed) + (usage.syncCredits ?? 0);
  const aiLeft = Math.max(0, limits.aiMessagesPerDay - usage.aiMessagesUsed) + (usage.aiCredits ?? 0);

  return (
    <PageFrame
      title="Support"
      icon={LifeBuoy}
      onBack={onBack}
      subtitle="Billing, memberships, broker connections, bugs — one thread each, and every reply lands here rather than in an inbox. Your account details are already attached, so you don't have to describe them."
    >
      {/* The conversations get the width; who you are and what to start sit beside them. On a
          narrow screen those come first, as they always did. */}
      <div className="grid gap-2 md:gap-3 items-start xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-2 md:gap-3 order-1 xl:order-2">
          {user && loaded && (
            <section className="panel-card p-3 md:p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[10px] uppercase tracking-widest text-accent/80 font-medium">
                  Your account
                </h2>
                {tier !== 'diamond' && (
                  <button
                    type="button"
                    onClick={goToPricing}
                    className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors focus-ring rounded"
                  >
                    Change plan
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-2 gap-2">
                <Fact icon={<CreditCard size={11} />} label="Plan" value={plan.name} hint={planHint} />
                <Fact
                  icon={<Plug size={11} />}
                  label="Syncs left today"
                  value={limits.syncsPerDay > 0 ? String(syncsLeft) : '—'}
                  hint={limits.syncsPerDay > 0 ? `of ${limits.syncsPerDay} a day` : 'Not on this plan'}
                />
                <Fact
                  icon={<Sparkles size={11} />}
                  label="AI left today"
                  value={limits.aiMessagesPerDay > 0 ? String(aiLeft) : '—'}
                  hint={
                    limits.aiMessagesPerDay > 0 ? `of ${limits.aiMessagesPerDay} a day` : 'Not on this plan'
                  }
                />
                <Fact
                  icon={<LifeBuoy size={11} />}
                  label="Account"
                  value={username ? `@${username}` : (user.email ?? 'Signed in')}
                  hint={username ? user.email : null}
                />
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2">
            <QuickAction
              icon={<CreditCard size={16} />}
              label="Billing"
              blurb="Charges, refunds, changing plan"
              onClick={() => startTicket('billing')}
            />
            <QuickAction
              icon={<Link2 size={16} />}
              label="Broker problem"
              blurb="A connection that stopped syncing"
              onClick={() => startTicket('broker')}
            />
            <QuickAction
              icon={<Bug size={16} />}
              label="Report a bug"
              blurb="Something in the app is broken"
              onClick={() => startTicket('bug')}
            />
          </div>
        </div>

        <div className="min-w-0 order-2 xl:order-1">
          <div className="flex items-center justify-between gap-3 mb-2 md:mb-3 px-0.5">
            <h2 className="text-sm font-semibold">Your conversations</h2>
            <button
              type="button"
              onClick={onBrokers}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors focus-ring rounded"
            >
              <Building2 size={13} />
              Supported brokers
            </button>
          </div>

          {/* Remounted on each quick action so the form opens again on a second click. */}
          <SupportTicketsContent
            key={compose ? `compose-${compose.n}` : 'threads'}
            embedded
            autoCompose={compose != null}
            initialCategory={compose?.category}
            onBack={onBack}
          />
        </div>
      </div>
    </PageFrame>
  );
}
