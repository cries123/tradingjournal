import { useEntitlement } from '../../context/useEntitlement';
import { useAuth } from '../../context/useAuth';

/** "3 days" / "1 day" — the shape of it is what makes a trial feel finite. */
function daysLeft(until: string): string {
  const ms = Date.parse(until) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'no time';
  const days = Math.ceil(ms / 86_400_000);
  return days === 1 ? '1 day' : `${days} days`;
}
/**
 * The lines about the plan that must be seen wherever the plan is: a failed payment, a trial about
 * to charge the card, access that was granted or comped.
 *
 * The plan card with its meters left the sidebar in the October 2026 redesign — the plan is a pill on
 * the profile row now, and the day's syncs are on the broker card. These lines are the part that
 * could not go with it: the trial line in particular is the only place in the app that says a charge
 * is coming. Shown in the sidebar and on More, and only when there is something to say.
 */
export function PlanNotice({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { loaded, source, status, complimentaryUntil, onTrial, trialEndsAt } = useEntitlement();
  if (!user || !loaded) return null;
  const anything =
    status === 'past_due' || source === 'admin' || (onTrial && Boolean(trialEndsAt)) || (source === 'comp' && Boolean(complimentaryUntil));
  if (!anything) return null;
  return (
    <div className={`rounded-xl border border-border/70 bg-bg-tertiary/40 px-3 py-2.5 space-y-1.5 ${className}`}>
      {status === 'past_due' && (
        <p className="text-[11px] text-loss-bright leading-snug">
          Your last payment didn&apos;t go through, so paid features are paused.
        </p>
      )}
      <PlanNoticeLines />
    </div>
  );
}

function PlanNoticeLines() {
  const { source, status, complimentaryUntil, onTrial, trialEndsAt } = useEntitlement();
  return (
    <>
      {source === 'admin' && (
        <p className="text-[11px] text-text-secondary leading-snug">Granted to your account — nothing to pay.</p>
      )}
      {/*
        A trial is a real subscription with a card behind it, so it is NOT the comp branch below.
        This used to be nested inside it, reading comp.trial — a field only a dead endpoint ever
        wrote — so a trialling customer saw the ordinary paid badge and nothing in the app ever
        mentioned the charge that was coming.
      */}
      {onTrial && trialEndsAt && (
        <p className="text-[11px] text-text-secondary leading-snug">
          {/* Days to decide by, then the date the money moves. Days alone is what let the emails
              avoid saying a charge was coming at all.

              Gated on status, because a cancelled trial still runs to its end date: telling somebody
              their card is about to be charged, in the app they opened to check the cancellation
              took, is the one thing worse than not mentioning the charge at all. */}
          {status === 'active' ? (
            <>
              Free trial — {daysLeft(trialEndsAt)} left, then{' '}
              {new Date(trialEndsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
              your card is charged. Cancel any time before then.
            </>
          ) : (
            <>
              Free trial — cancelled, so nothing is charged. Yours until{' '}
              {new Date(trialEndsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.
            </>
          )}
        </p>
      )}
      {source === 'comp' && complimentaryUntil && (
        <p className="text-[11px] text-text-secondary leading-snug">
          On us until{' '}
          {new Date(complimentaryUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — nothing to pay.
        </p>
      )}
    </>
  );
}
