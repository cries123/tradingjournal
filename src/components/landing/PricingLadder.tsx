import { Check } from 'lucide-react';
import { featureLines, TIER_ORDER, TIER_PLANS, type Tier } from '../../config/tiers';
import { hasTrial, TRIAL_DAYS } from '../../config/trial';

interface PricingLadderProps {
  /** Free, or a paid plan's trial: both start in the journal, which takes it from there. */
  onStart: () => void;
  onPricing: () => void;
}

/** The plan the ladder lifts out: the first one with the assistant and the simulator. */
const FEATURED: Tier = 'gold';

/**
 * The four plans on the home page.
 *
 * Prices were a click away on their own page, and the landing page never said what anything cost
 * beyond "from $9" — so a visitor deciding had to leave to find out. The lines come from
 * featureLines(), the function the pricing page prints, so the two pages cannot disagree, and the
 * trial badge from hasTrial(), so a plan is never advertised with a trial its checkout does not run.
 * Monthly prices only; the yearly toggle and checkout stay on the pricing page.
 */
export function PricingLadder({ onStart, onPricing }: PricingLadderProps) {
  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TIER_ORDER.map((tier) => {
        const plan = TIER_PLANS[tier];
        const featured = tier === FEATURED;
        const trial = hasTrial(tier);
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
            <h3 className="text-xl font-semibold">{plan.name}</h3>
            <p className="mt-1 min-h-[2.75rem] text-sm text-text-secondary">{plan.tagline}</p>
            <p className="mt-4 text-[46px] font-bold leading-none tracking-tight">
              ${plan.price}
              {plan.price > 0 && <span className="ml-1 text-[15px] font-medium tracking-normal text-text-secondary">/month</span>}
            </p>
            <p className="mt-2 min-h-[1.25rem] text-xs text-text-secondary">
              {plan.price === 0 ? 'No card needed.' : trial ? `Free for ${TRIAL_DAYS} days, then $${plan.price} a month. Cancel any time.` : ''}
            </p>
            <ul className="mb-6 mt-5 grid gap-2.5 text-[14.5px]">
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
              onClick={plan.price === 0 ? onStart : onPricing}
              className={`mt-auto ${featured ? 'btn-primary' : 'btn-secondary'} w-full justify-center py-3 text-[15px]`}
            >
              {plan.price === 0 ? 'Start free' : trial ? 'Start free trial' : `Choose ${plan.name}`}
            </button>
          </article>
        );
      })}
    </div>
  );
}
