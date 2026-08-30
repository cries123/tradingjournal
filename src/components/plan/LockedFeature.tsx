import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { lowestTierWith, TIER_PLANS, type Feature } from '../../config/tiers';
import { useEntitlement } from '../../context/EntitlementContext';
import { goToPricing } from '../../utils/navigateToPath';

interface LockedFeatureProps {
  feature: Feature;
  title: string;
  /** One line on what they'd get. Keep it about the feature, not about paying. */
  description: string;
  children: ReactNode;
  /** Set for a feature that is sold but not finished yet — says "coming soon", not "upgrade". */
  comingSoon?: boolean;
  /** Layout classes for the wrapper, for callers that live inside a flex or fixed-height panel. */
  className?: string;
}

/**
 * Shows a feature the caller may not have, rather than hiding it.
 *
 * The real UI stays on screen behind the overlay — dimmed, blurred and inert — because a locked
 * feature you can see is an invitation and a feature you can't see is a missing feature. Both the
 * pointer and the keyboard have to be blocked (`inert`), or the controls behind the overlay stay
 * tabbable and someone can operate a panel they're being told they can't use.
 *
 * This is presentation only. Every limit is also enforced in the serverless functions, so
 * defeating this in dev tools gets you a 402, not a free plan.
 */
export function LockedFeature({
  feature,
  title,
  description,
  children,
  comingSoon,
  className = '',
}: LockedFeatureProps) {
  const { has, loaded, marketReplayLive } = useEntitlement();

  const soon = comingSoon ?? (feature === 'marketReplay' && !marketReplayLive);
  const unlocked = has(feature);

  // Until the plan is known, show the feature as-is. Flashing a paywall at a paying customer on
  // every page load is worse than a half-second of optimism.
  if (!loaded || (unlocked && !soon)) return <>{children}</>;

  const needed = lowestTierWith(feature);
  const neededName = needed ? TIER_PLANS[needed].name : 'a paid plan';

  return (
    /* Grid-stacked rather than absolutely positioned. Both children occupy the same cell, so the
       wrapper is as tall as the TALLER of them — which means the lock card can never overflow a
       panel that shrank to fit a short preview. An absolute overlay contributes no height, and in
       the assistant dock that pushed the card straight off the bottom of the screen. */
    <div className={`relative grid ${className}`}>
      {/* Clipped to about a screenful: the preview is a glimpse of the feature, not the feature. */}
      <div
        className="[grid-area:1/1] pointer-events-none select-none overflow-hidden blur-[2px] opacity-35 max-h-[min(70vh,620px)] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
        aria-hidden="true"
        // @ts-expect-error -- `inert` is a valid HTML attribute; React 19 types lag behind it.
        inert=""
      >
        {children}
      </div>

      <div className="[grid-area:1/1] flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card/95 backdrop-blur-sm p-5 sm:p-6 text-center shadow-2xl">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-bg-tertiary mb-3">
            <Lock className="w-4 h-4 text-text-secondary" aria-hidden />
          </span>
          <h3 className="text-base font-semibold mb-1.5">{title}</h3>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">{description}</p>

          {soon ? (
            <p className="text-sm text-text-secondary">
              {unlocked
                ? "It's included in your plan — we'll turn it on here the moment it's ready."
                : `Coming soon, and included with ${neededName} when it lands.`}
            </p>
          ) : (
            <>
              <button type="button" onClick={goToPricing} className="btn-primary w-full py-2.5 text-sm font-semibold">
                Unlock with {neededName}
              </button>
              <p className="mt-2.5 text-xs text-text-secondary">
                From ${needed ? TIER_PLANS[needed].price : 5}/month · cancel anytime
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
