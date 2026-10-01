import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { TIER_PLANS } from '../../config/tiers';
import { TRIAL_DAYS, TRIAL_TIER } from '../../config/trial';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { goToPricing } from '../../utils/navigateToPath';
import { choosePlan } from '../../services/entitlement';

interface StartTrialButtonProps {
  /** Rendered when there is no trial to offer — a buy button, usually. */
  fallback?: React.ReactNode;
  className?: string;
  /** Shown under the button. Off where the surrounding copy already says it. */
  showTerms?: boolean;
  /**
   * Send them to the pricing page rather than straight into checkout.
   *
   * For the places that are not the pricing page: somebody who clicked a locked panel has not
   * seen what any of the plans include, and dropping them on a payment form is a good way to
   * lose them. The pricing page is one more click and answers the question they actually have.
   */
  viaPricing?: boolean;
}

/**
 * The trial, wherever somebody runs into the wall.
 *
 * The trial itself belongs to Creem — it is attached to the Silver product, so starting it means
 * going through checkout and the card is taken up front. Two consequences worth knowing here: the
 * person becomes a real subscriber immediately, so nothing about ACCESS needs a special case; and
 * TRIAL_DAYS has to match what the Creem product is configured for, because this is the number the
 * site promises.
 *
 * The terms line below is the disclosure. It is the only place in the product that says a card is
 * taken and what happens on day 8, which is why showTerms defaults on and why the pricing page —
 * where most trials start — had it switched off for a year.
 */
export function StartTrialButton({
  fallback = null,
  className = '',
  showTerms = true,
  viaPricing = false,
}: StartTrialButtonProps) {
  const { user } = useAuth();
  const { trialAvailable, loaded } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed out, there is nothing to attach a subscription to. The pricing page handles the
  // sign-in prompt, so send them there rather than growing a second one here.
  if (!user) return <>{fallback}</>;

  /*
   * And signed in without an eligible account.
   *
   * This button says, in its own terms line, that cancelling before the end costs nothing. That is
   * only true if a trial is actually on offer, and until the Creem webhook started writing
   * trialStartedAt the server's 'you have already had one' rule had never fired for anybody — so
   * the question never came up. It fires now, and the two places that render this button gate on
   * the FEATURE being locked rather than on eligibility, which would promise a free week to
   * somebody who has used theirs. Checked here rather than at each call site so a third one cannot
   * forget.
   */
  if (loaded && !trialAvailable) return <>{fallback}</>;

  const start = async () => {
    if (viaPricing) {
      goToPricing();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await choosePlan(TRIAL_TIER);
      if (result.kind === 'checkout') {
        window.location.assign(result.url);
        return;
      }
      // Already subscribed, so the plan moved instead of a checkout opening. Nothing to redirect
      // to, and nothing was charged twice.
      setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open checkout. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="btn-primary w-full py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Sparkles size={15} aria-hidden />
        {busy ? 'Opening checkout…' : `Try ${TIER_PLANS[TRIAL_TIER].name} free for ${TRIAL_DAYS} days`}
      </button>

      {showTerms && !error && (
        <p className="mt-2.5 text-xs text-text-secondary text-center">
          ${TIER_PLANS[TRIAL_TIER].price}/month after. Cancel any time before then and you pay nothing.
        </p>
      )}
      {error && <p className="mt-2.5 text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
