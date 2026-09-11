import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { openBillingPortal } from '../../services/entitlement';
import { TIER_PLANS } from '../../config/tiers';
import { goToPricing } from '../../utils/navigateToPath';
import { AccountPanel, AccountScreen, FormNote } from './AccountScreen';

interface SubscriptionContentProps {
  onBack: () => void;
  onOrderHistory: () => void;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * The plan, and the way out of it.
 *
 * Cancelling opens Creem's billing portal rather than being rebuilt here, and that is a deliberate
 * choice rather than a shortcut: a cancel button of our own is one more thing that can report
 * success while the subscription quietly keeps billing, and "I cancelled and you charged me
 * anyway" is the worst message a small SaaS can receive. The portal is the system that actually
 * owns the subscription, so it is the one that gets to say it stopped.
 *
 * Until now the only link to it was a sentence under the pricing table — which is also what the
 * terms of service and the refund policy both told people to look for in Settings.
 */
export function SubscriptionContent({ onBack, onOrderHistory }: SubscriptionContentProps) {
  const { user } = useAuth();
  const { tier, status, source, currentPeriodEnd, complimentaryUntil, loaded } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = TIER_PLANS[tier];
  const paying = Boolean(user) && loaded && source === 'purchase' && tier !== 'free';
  const renewsOn = formatDate(currentPeriodEnd);
  const compUntil = formatDate(complimentaryUntil ?? null);

  const openPortal = async () => {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await openBillingPortal());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the billing portal.');
      setBusy(false);
    }
  };

  return (
    <AccountScreen
      title="Subscription"
      subtitle="What you are on, what it renews at, and how to stop it."
      onBack={onBack}
    >
      <AccountPanel title="Current plan">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-bold">{plan.name}</span>
          {plan.price > 0 && <span className="text-sm text-text-secondary">${plan.price}/month</span>}
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">{plan.tagline}</p>

        {source === 'admin' && (
          <p className="text-sm text-text-secondary">
            This plan was granted directly rather than bought, so there is no subscription to manage
            and nothing is being charged.
          </p>
        )}

        {compUntil && (
          <p className="text-sm text-text-secondary">Complimentary access until {compUntil}.</p>
        )}

        {/* The two states people actually need spelled out, in the words they would use. */}
        {status === 'canceled' && renewsOn && (
          <p className="text-sm text-amber-300">
            Cancelled — you keep {plan.name} until {renewsOn}, and you will not be charged again.
          </p>
        )}
        {status === 'active' && paying && renewsOn && (
          <p className="text-sm text-text-secondary">Renews {renewsOn}.</p>
        )}
        {status === 'past_due' && (
          <p className="text-sm text-red-400">
            Your last payment did not go through. Update your card to keep {plan.name}.
          </p>
        )}
      </AccountPanel>

      {paying ? (
        <AccountPanel
          title="Manage or cancel"
          description="Cancelling, changing your card and downloading invoices all happen on your billing page. Cancel any time — your plan runs to the end of the period you have already paid for."
        >
          <FormNote error={error} />
          <button
            type="button"
            onClick={() => void openPortal()}
            disabled={busy}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            <ExternalLink size={15} aria-hidden />
            {busy ? 'Opening…' : 'Manage billing or cancel'}
          </button>
        </AccountPanel>
      ) : (
        <AccountPanel
          title="Manage or cancel"
          description={
            source === 'admin'
              ? 'Nothing to cancel — this plan is not a subscription.'
              : 'You are not subscribed, so there is nothing to cancel and nothing being charged.'
          }
        >
          {source !== 'admin' && (
            <button
              type="button"
              onClick={goToPricing}
              className="btn-primary px-4 py-2 text-sm font-semibold"
            >
              See plans
            </button>
          )}
        </AccountPanel>
      )}

      <AccountPanel
        title="Payments"
        description="Every charge we have ever taken from you, with the date and the amount."
      >
        <button
          type="button"
          onClick={onOrderHistory}
          className="text-sm text-accent hover:underline focus-ring rounded"
        >
          View order history →
        </button>
      </AccountPanel>
    </AccountScreen>
  );
}
