import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BadgeCheck, Check, Clock, Crown, Gem, Medal, Notebook, ShieldCheck, Sparkles } from 'lucide-react';
import { featureLines, TIER_ORDER, TIER_PLANS, type Tier } from '../../config/tiers';
import { REFUND_WINDOW_DAYS } from '../../config/legal';
import { BROKER_COUNT_PHRASE } from '../../data/brokerCopy';
import { useAuth } from '../../context/AuthContext';
import { useEntitlement } from '../../context/EntitlementContext';
import {
  CheckoutError,
  choosePlan,
  fetchPaymentsStatus,
  openBillingPortal,
  type PaymentsStatus,
} from '../../services/entitlement';

const TIER_ICON: Record<Tier, typeof Notebook> = {
  free: Notebook,
  silver: Medal,
  gold: Crown,
  diamond: Gem,
};

/** Per-tier accent, so the four cards read as a ladder rather than four copies of one card. */
const TIER_ACCENT: Record<Tier, { ring: string; text: string; chip: string; button: string }> = {
  free: {
    ring: 'border-border',
    text: 'text-text-secondary',
    chip: 'bg-bg-tertiary text-text-secondary',
    button: 'border border-border text-text-secondary hover:text-text-primary hover:border-slate-500',
  },
  silver: {
    ring: 'border-slate-500/40',
    text: 'text-slate-300',
    chip: 'bg-slate-400/10 text-slate-300',
    button: 'border border-slate-400/50 text-slate-100 hover:bg-slate-400/10 hover:border-slate-300',
  },
  gold: {
    ring: 'border-amber-400/50',
    text: 'text-amber-300',
    chip: 'bg-amber-400/10 text-amber-300',
    button: 'bg-amber-400 text-slate-950 hover:bg-amber-300 font-semibold',
  },
  diamond: {
    ring: 'border-sky-400/50',
    text: 'text-sky-300',
    chip: 'bg-sky-400/10 text-sky-300',
    button:
      'bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 hover:from-sky-300 hover:to-emerald-300 font-semibold',
  },
};

interface PricingContentProps {
  onBack?: () => void;
  backLabel?: string;
  onLaunch?: () => void;
  onRefunds?: () => void;
  onBrokers?: () => void;
}

export function PricingContent({
  onBack,
  backLabel = 'Back to home',
  onLaunch,
  onRefunds,
  onBrokers,
}: PricingContentProps) {
  const { user } = useAuth();
  const { tier: currentTier, loaded, source, refresh } = useEntitlement();
  const [busy, setBusy] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The payment provider's own words. Only ever populated for the site admin. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [payments, setPayments] = useState<PaymentsStatus | null>(null);
  // Read from the URL at mount rather than set from an effect, so the banner is right on the
  // first paint the buyer sees after being sent back from checkout.
  const [justPaid] = useState(
    () => new URLSearchParams(window.location.search).get('checkout') === 'success',
  );

  // Creem returns the buyer to /pricing?checkout=success, but the webhook that actually grants the
  // tier may land a second or two behind them. Re-checking on a short schedule is what stops the
  // page telling someone who just paid that they're still on Free.
  useEffect(() => {
    if (!justPaid) return;
    window.history.replaceState({}, '', '/pricing');

    let cancelled = false;
    const timers = [0, 2000, 5000, 10000].map((ms) =>
      window.setTimeout(() => {
        if (!cancelled) void refresh();
      }, ms),
    );
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [refresh, justPaid]);

  // Cheap, public and unauthenticated — it only reports which env vars exist, never their values.
  // Worth one request so a site left in test mode can say so on the page instead of quietly taking
  // pretend money from real customers.
  useEffect(() => {
    let cancelled = false;
    void fetchPaymentsStatus().then((s) => {
      if (!cancelled) setPayments(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentIndex = useMemo(() => TIER_ORDER.indexOf(currentTier), [currentTier]);

  /* Only ever true once the status has actually loaded. Treating "not loaded yet" as paused would
     flash "temporarily unavailable" across every plan on a normal page load. */
  const checkoutPaused = payments?.checkoutEnabled === false;
  /** Paying customer with a real subscription — as opposed to free, or a hand-granted tier. */
  const subscribed = Boolean(user) && loaded && source === 'purchase' && currentTier !== 'free';

  const handlePortal = async () => {
    setError(null);
    setPortalBusy(true);
    try {
      window.location.assign(await openBillingPortal());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the billing portal.');
      setPortalBusy(false);
    }
  };

  const handleChoose = async (tier: Tier) => {
    setError(null);
    setErrorDetail(null);
    setNotice(null);
    if (!user) {
      onLaunch?.();
      return;
    }
    setBusy(tier);
    try {
      const result = await choosePlan(tier);
      if (result.kind === 'checkout') {
        window.location.assign(result.url);
        return;
      }
      // An existing subscriber was moved in place — no checkout page to send them to, so the page
      // has to say what happened and re-read the plan it now shows.
      setNotice(result.message);
      await refresh();
      setBusy(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setErrorDetail(err instanceof CheckoutError ? (err.detail ?? null) : null);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-[1680px] mx-auto px-4 md:px-8 py-10 md:py-14 w-full">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden /> {backLabel}
        </button>
      )}

      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400 mb-3">Plans</p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-balance">
          Journalling is free. Automation is the part that costs money.
        </h1>
        <p className="text-base md:text-lg text-text-secondary leading-relaxed">
          Log every trade by hand for nothing, forever. Paid plans exist because each connected
          brokerage carries a monthly cost whether you sync once or a hundred times — so the plans
          are priced against that, not against how much we think your P&amp;L is worth.
        </p>
      </header>

      {justPaid && (
        <div className="mt-8 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 shrink-0" aria-hidden />
          Payment received. Your plan updates here within a few seconds.
        </div>
      )}

      {/*
        The maintenance switch, set from the admin panel.
        Shown above the test-mode notice because it is the more actionable of the two: nothing on
        this page can be bought right now, and saying so beats a button that errors on click. The
        server refuses these requests regardless — this is the courtesy, not the enforcement.
      */}
      {payments && payments.checkoutEnabled === false && (
        <div className="mt-8 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>
            <span className="font-semibold">Purchases are paused.</span>{' '}
            {payments.maintenanceMessage || 'Please check back shortly.'}
          </span>
        </div>
      )}

      {/* Only rendered while the server is pointed at Creem's sandbox. Leaving test mode on in
          production means every "purchase" succeeds and charges nobody — the failure you'd
          discover from a month of revenue that never arrived. Better to say it on the page. */}
      {payments?.testMode && (
        <div className="mt-8 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <span className="font-semibold">Test mode.</span> Checkout is pointed at Creem&apos;s
          sandbox — cards are not charged and no real subscription is created. Set{' '}
          <code className="font-mono text-xs">CREEM_TEST_MODE=false</code> with live keys before
          taking payments.
        </div>
      )}

      {notice && (
        <div className="mt-8 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 shrink-0" aria-hidden />
          {notice}
        </div>
      )}

      {error && (
        <div
          className="mt-8 rounded-xl border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss-bright"
          role="alert"
        >
          {error}
          {/* The server attaches this for the site admin only, so if it's here you're the person
              who can act on it. Saves a trip through the function logs for every setup mistake. */}
          {errorDetail && (
            <p className="mt-2 pt-2 border-t border-loss/30 font-mono text-xs text-loss-bright/80 break-words">
              {errorDetail}
            </p>
          )}
        </div>
      )}

      <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:items-start">
        {TIER_ORDER.map((tier) => {
          const plan = TIER_PLANS[tier];
          const accent = TIER_ACCENT[tier];
          const Icon = TIER_ICON[tier];
          // Only marked for someone signed in: a visitor who has never had an account isn't "on"
          // the free plan, and badging it that way makes the page read as already-decided.
          const isCurrent = Boolean(user) && loaded && tier === currentTier;
          const isDowngrade = Boolean(user) && loaded && TIER_ORDER.indexOf(tier) < currentIndex;
          const popular = tier === 'gold';

          return (
            <section
              key={tier}
              className={`relative flex flex-col h-full rounded-2xl border bg-bg-card/80 p-6 ${accent.ring} ${
                popular ? 'shadow-[0_20px_60px_-24px_rgba(251,191,36,0.4)]' : ''
              }`}
            >
              {popular && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-950">
                  Most popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-2.5 right-6 rounded-full bg-emerald-400 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-950">
                  Your plan
                </span>
              )}

              <div className={`flex items-center gap-2 ${accent.text}`}>
                <Icon className="w-4 h-4" aria-hidden />
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">{plan.name}</h2>
              </div>

              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight tabular-nums">${plan.price}</span>
                <span className="text-sm text-text-secondary">
                  {plan.price === 0 ? 'forever' : '/month'}
                </span>
              </p>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed sm:min-h-[2.75rem]">
                {plan.tagline}
              </p>

              <ul className="mt-5 space-y-2.5 flex-1">
                {featureLines(tier).map((line) => (
                  <li key={line.text} className="flex items-start gap-2 text-sm">
                    {line.soon ? (
                      <Clock className="w-4 h-4 mt-0.5 shrink-0 text-text-secondary" aria-hidden />
                    ) : (
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${accent.text}`} aria-hidden />
                    )}
                    <span className={line.soon ? 'text-text-secondary' : 'text-text-primary/90'}>
                      {line.text}
                      {line.soon && (
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent.chip}`}
                        >
                          Coming soon
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {tier === 'free' ? (
                  <button
                    type="button"
                    onClick={onLaunch}
                    className={`w-full rounded-lg px-4 py-2.5 text-sm transition-colors ${accent.button}`}
                  >
                    {isCurrent ? 'Open your journal' : 'Start free'}
                  </button>
                ) : isCurrent ? (
                  <div className="w-full rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-2.5 text-center text-sm font-medium text-emerald-300">
                    {source === 'admin' ? 'Granted to your account' : 'Current plan'}
                  </div>
                ) : checkoutPaused ? (
                  /* Not a disabled buy button: a disabled control invites clicking to find out
                     why. This says the reason where the button would have been. */
                  <div className="w-full rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-center text-sm font-medium text-amber-200">
                    Temporarily unavailable
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleChoose(tier)}
                    className={`w-full rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${accent.button}`}
                  >
                    {/* A subscriber is moving an existing subscription, not buying another one, so
                        the label says so. "Add to cart" next to a plan they already pay for is how
                        someone ends up expecting two of something they can only have one of. */}
                    {busy === tier
                      ? subscribed
                        ? 'Changing your plan…'
                        : 'Opening checkout…'
                      : !user
                        ? `Sign in to get ${plan.name}`
                        : subscribed
                          ? isDowngrade
                            ? `Move down to ${plan.name}`
                            : `Upgrade to ${plan.name}`
                          : isDowngrade
                            ? `Switch to ${plan.name}`
                            : `Add ${plan.name} to cart`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {subscribed && (
        <p className="mt-5 text-sm text-text-secondary">
          Changing plans moves your existing subscription — you are never billed for two.{' '}
          <button
            type="button"
            onClick={() => void handlePortal()}
            disabled={portalBusy}
            className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-60"
          >
            {portalBusy ? 'Opening…' : 'Manage billing or cancel →'}
          </button>
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg-secondary/60 p-5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 mb-2.5" aria-hidden />
          <h3 className="text-sm font-semibold mb-1.5">{REFUND_WINDOW_DAYS}-day money back</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Ask within the first {REFUND_WINDOW_DAYS} days and you get every cent back. No questions,
            no conditions.
          </p>
          {onRefunds && (
            <button
              type="button"
              onClick={onRefunds}
              className="mt-2.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Read the refund policy →
            </button>
          )}
        </div>

        <div className="rounded-xl border border-border bg-bg-secondary/60 p-5">
          <Sparkles className="w-4 h-4 text-emerald-400 mb-2.5" aria-hidden />
          <h3 className="text-sm font-semibold mb-1.5">Cancel in a click</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            No contract, no call to make. Cancel and you keep the plan until the period you already
            paid for runs out — and your trades stay yours either way.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-bg-secondary/60 p-5">
          <BadgeCheck className="w-4 h-4 text-emerald-400 mb-2.5" aria-hidden />
          <h3 className="text-sm font-semibold mb-1.5">Works with your broker</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            {BROKER_COUNT_PHRASE} connect directly, read-only — we can see fills, never move money,
            and never place a trade.
          </p>
          {onBrokers && (
            <button
              type="button"
              onClick={onBrokers}
              className="mt-2.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              See supported brokers →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
