import { useState } from 'react';
import {
  ArrowLeft,
  Bug,
  Building2,
  CreditCard,
  LifeBuoy,
  Link2,
  MessageSquarePlus,
  Plug,
  Sparkles,
} from 'lucide-react';
import { syncsUnlimited, TIER_PLANS } from '../../config/tiers';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { goToPricing } from '../../utils/navigateToPath';
import type { TicketCategory } from '../../services/supportTickets';
import { SupportTicketsContent } from './SupportTicketsContent';

interface SupportDashboardProps {
  onBack: () => void;
  /** Opens the supported-brokers list, which is still its own screen. */
  onBrokers: () => void;
  /** Opens the "my broker isn't here" form. */
  onRequestBroker: () => void;
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
export function SupportDashboard({ onBack, onBrokers, onRequestBroker }: SupportDashboardProps) {
  const { user, username } = useAuth();
  const { tier, limits, usage, status, source, currentPeriodEnd, complimentaryUntil, onTrial, loaded } =
    useEntitlement();

  /* A counter, not just a category: choosing "Report a bug" twice in a row has to reopen the form
     the second time, and a bare category would be the same value and remount nothing. */
  const [compose, setCompose] = useState<{ category: TicketCategory; n: number } | null>(null);
  const startTicket = (category: TicketCategory) =>
    setCompose((prev) => ({ category, n: (prev?.n ?? 0) + 1 }));

  const plan = TIER_PLANS[tier];
  const renewal = shortDate(currentPeriodEnd);
  const compUntil = shortDate(complimentaryUntil);

  const planHint =
    source === 'admin'
      ? 'Granted to your account'
      : onTrial && compUntil
        ? `Free trial through ${compUntil}`
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
    <div className="pb-6">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-6 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <LifeBuoy size={22} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Support</h1>
        </div>
        <p className="text-text-secondary mb-6 leading-relaxed max-w-2xl">
          Billing, memberships, broker connections, bugs — one thread each, and every reply lands
          here rather than in an inbox. Your account details are already attached, so you don&apos;t
          have to describe them.
        </p>

        {user && loaded && (
          <section className="panel-card p-3 md:p-4 mb-4">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Fact icon={<CreditCard size={11} />} label="Plan" value={plan.name} hint={planHint} />
              <Fact
                icon={<Plug size={11} />}
                label={syncsUnlimited(limits) ? 'Broker syncs' : 'Syncs left today'}
                value={
                  limits.syncsPerDay <= 0 ? '—' : syncsUnlimited(limits) ? 'Unlimited' : String(syncsLeft)
                }
                hint={
                  limits.syncsPerDay <= 0
                    ? 'Not on this plan'
                    : syncsUnlimited(limits)
                      ? `${usage.syncsUsed} used today`
                      : `of ${limits.syncsPerDay} a day`
                }
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
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
          <QuickAction
            icon={<MessageSquarePlus size={16} />}
            label="Request a broker"
            blurb="Yours isn't on the list yet"
            onClick={onRequestBroker}
          />
        </div>

        <div className="flex items-center justify-between gap-3 mb-3">
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
  );
}
