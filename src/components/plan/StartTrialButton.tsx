import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { TIER_PLANS } from '../../config/tiers';
import { TRIAL_DAYS, TRIAL_TIER } from '../../config/trial';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import {
  refreshEmailVerified,
  resendEmailVerification,
  startFreeTrial,
} from '../../services/entitlement';

interface StartTrialButtonProps {
  /** Rendered when there is no trial to offer — a buy button, usually. */
  fallback?: React.ReactNode;
  className?: string;
  /** Shown under the button. Off where the surrounding copy already says it. */
  showTerms?: boolean;
  onStarted?: () => void;
}

/**
 * The offer, wherever somebody runs into the wall.
 *
 * It used to live only on the pricing page, which is the one place people arrive at already
 * thinking about money. The moment that actually converts is the one where they wanted to do
 * something and couldn't — opening Performance, pressing Connect Broker — so the button belongs
 * there, and this component is what makes putting it there a one-liner.
 *
 * Self-contained on purpose: it owns its own busy and error state, because a caller that has to
 * thread four pieces of state through to use it will not bother.
 */
export function StartTrialButton({
  fallback = null,
  className = '',
  showTerms = true,
  onStarted,
}: StartTrialButtonProps) {
  const { user } = useAuth();
  const { loaded, trialAvailable, trialBlockedReason, trialBlockedMessage, refresh } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // An unconfirmed address is not a dead end, it is a step nobody has been asked to take. Every
  // other refusal is final for this account, so the offer is simply not made.
  const unverified = trialBlockedReason === 'email-unverified';
  const offer = Boolean(user) && loaded && (trialAvailable || unverified);

  if (!offer) return <>{fallback}</>;

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const said = await fn();
      await refresh();
      if (said) setNotice(said);
      onStarted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const verify = () =>
    run(async () => {
      // Checked first: they may have opened the link in another tab, in which case there is
      // nothing to send and the trial is simply ready.
      if (await refreshEmailVerified()) return 'Thanks — your email is confirmed. Start your trial.';
      await resendEmailVerification();
      return 'Confirmation link sent. Open it, then press this again.';
    });

  const start = () =>
    run(async () => {
      const { message } = await startFreeTrial();
      return message;
    });

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void (unverified ? verify() : start())}
        className="btn-primary w-full py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Sparkles size={15} aria-hidden />
        {busy
          ? 'One moment…'
          : unverified
            ? 'Confirm your email to start free'
            : `Start ${TRIAL_DAYS} days of ${TIER_PLANS[TRIAL_TIER].name}, free`}
      </button>

      {showTerms && !error && !notice && (
        <p className="mt-2.5 text-xs text-text-secondary text-center">
          {unverified
            ? (trialBlockedMessage ?? 'Confirm your email address first.')
            : 'No card needed. It ends on its own — nothing to cancel.'}
        </p>
      )}
      {notice && <p className="mt-2.5 text-xs text-emerald-300 text-center">{notice}</p>}
      {error && <p className="mt-2.5 text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
