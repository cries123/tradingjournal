import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { ANNUAL_MONTHS_CHARGED, annualMonthlyEquivalent, annualPrice, featureLines, PAID_TIERS, TIER_ORDER, TIER_PLANS, type Tier } from '../../config/tiers';
import { hasTrial, TRIAL_DAYS } from '../../config/trial';
import { canSkipTrial, fetchPaymentsStatus, type PaymentsStatus } from '../../services/entitlement';

interface PricingLadderProps {
  /** Free starts in the journal; a paid plan goes to the pricing page, where checkout is. */
  onStart: () => void;
  onPricing: () => void;
}

/** The plan the ladder lifts out: the first one with the assistant and the simulator. */
const FEATURED: Tier = 'gold';

/** "$7.50", "$15.83", "$32.50": a monthly equivalent shows its cents; a whole price does not. */
const dollars = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/**
 * The four plans on the home page, monthly or yearly.
 *
 * Prices were a click away on their own page, and the landing page never said what anything cost
 * beyond "from $9" — so a visitor deciding had to leave to find out. The lines come from
 * featureLines(), the function the pricing page prints, so the two pages cannot disagree; the trial
 * badge from hasTrial(), so a plan is never advertised with a trial its checkout does not run; the
 * yearly figures from annualPrice(), the number checkout charges.
 *
 * Yearly has no trial (it starts paid), so the badge is a monthly thing. Whether yearly can be bought
 * yet is the server's answer (payments-status `annualReady`), read here the way the pricing page reads
 * it: until it says yes, the yearly prices show with "coming soon" rather than a button that fails.
 */
export function PricingLadder({ onStart, onPricing }: PricingLadderProps) {
  const [yearly, setYearly] = useState(false);
  // Null until the server answers: nothing is claimed about yearly or skipping the trial before then.
  const [status, setStatus] = useState<PaymentsStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPaymentsStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const free = 12 - ANNUAL_MONTHS_CHARGED;
  const annualReady = status ? status.annualReady === true : null;
  // Said only once every plan can actually be bought without its trial (see canSkipTrial).
  const skipEverywhere = PAID_TIERS.every((t) => canSkipTrial(status, t));

  return (
    <>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-white/10 bg-[#111] p-1" role="group" aria-label="Billing period">
          {([false, true] as const).map((isYearly) => (
            <button
              key={String(isYearly)}
              type="button"
              onClick={() => setYearly(isYearly)}
              aria-pressed={yearly === isYearly}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-ring ${
                yearly === isYearly ? 'bg-accent text-black' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {isYearly ? 'Yearly' : 'Monthly'}
            </button>
          ))}
        </div>
        <p className="text-sm text-text-secondary">
          {yearly ? (
            <>
              {free} months free on every plan. Yearly starts paid, with no free trial.
              {annualReady === false && <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-xs font-semibold text-amber-200">Coming soon</span>}
            </>
          ) : (
            <>
              Every paid plan starts with a {TRIAL_DAYS}-day free trial, one per person
              {skipEverywhere ? ', or skip it and pay from today' : ''}. Yearly saves {free} months.
            </>
          )}
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TIER_ORDER.map((tier) => {
          const plan = TIER_PLANS[tier];
          const featured = tier === FEATURED;
          const trial = !yearly && hasTrial(tier);
          const paid = plan.price > 0;
          return (
            <article
              key={tier}
              className={`relative flex flex-col rounded-[22px] border p-6 ${
                featured
                  ? 'border-accent/45 bg-[linear-gradient(180deg,rgba(122,255,69,0.08),#141414_45%)]'
                  : 'border-white/[0.07] bg-[#141414]'
              }`}
            >
              {trial && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-black">
                  {TRIAL_DAYS}-day free trial
                </span>
              )}
              {yearly && paid && (
                <span className="absolute -top-3 left-6 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-black">
                  {free} months free
                </span>
              )}
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              <p className="mt-1 min-h-[2.75rem] text-sm text-text-secondary">{plan.tagline}</p>
              <p className="mt-4 text-[46px] font-bold leading-none tracking-tight">
                {yearly && paid ? dollars(annualMonthlyEquivalent(tier)) : `$${plan.price}`}
                {paid && <span className="ml-1 text-[15px] font-medium tracking-normal text-text-secondary">/month</span>}
              </p>
              <p className="mt-2 min-h-[2.5rem] text-xs text-text-secondary">
                {!paid
                  ? 'No card needed.'
                  : yearly
                    ? `$${annualPrice(tier)} billed once a year.`
                    : trial
                      ? `Free for ${TRIAL_DAYS} days, then $${plan.price} a month. Cancel any time before then and you pay nothing.`
                      : ''}
              </p>
              <ul className="mb-6 mt-4 grid gap-2.5 text-[14.5px]">
                {featureLines(tier).map((line) => (
                  <li key={line.text} className="grid grid-cols-[18px_1fr] gap-2.5 text-[#d6d6d6]">
                    <span className="mt-[3px] grid h-4 w-4 place-items-center rounded-full bg-accent/15 text-accent">
                      <Check size={11} strokeWidth={3} aria-hidden />
                    </span>
                    {line.text}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={paid ? onPricing : onStart}
                className={`mt-auto ${featured ? 'btn-primary' : 'btn-secondary'} w-full justify-center py-3 text-[15px]`}
              >
                {!paid ? 'Start free' : yearly ? `Choose ${plan.name} yearly` : trial ? 'Start free trial' : `Choose ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
