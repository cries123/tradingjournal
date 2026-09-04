import { Check, Circle, Sparkles, X } from 'lucide-react';
import { onboardingProgress, onboardingSteps, type OnboardingStepId } from '../../utils/onboardingSteps';

interface GettingStartedCardProps {
  tradeCount: number;
  brokerConnected: boolean;
  hasTradeNote: boolean;
  hasRiskRules: boolean;
  canConnectBroker: boolean;
  onStep: (id: OnboardingStepId) => void;
  onDismiss: () => void;
}

/**
 * What to do next, for somebody who has not done anything yet.
 *
 * Twenty of the first thirty-three signups never logged a trade. They made an account and left,
 * which is not a pricing problem — there is nothing to buy until the thing has been useful once.
 *
 * It takes itself away when the list is finished, and can be dismissed before then. A card that
 * congratulates you for a week after you have finished with it is clutter, and a permanent
 * checklist is a nag.
 */
export function GettingStartedCard({
  tradeCount,
  brokerConnected,
  hasTradeNote,
  hasRiskRules,
  canConnectBroker,
  onStep,
  onDismiss,
}: GettingStartedCardProps) {
  const steps = onboardingSteps({ tradeCount, brokerConnected, hasTradeNote, hasRiskRules, canConnectBroker });
  const { done, total, complete } = onboardingProgress(steps);

  if (complete) return null;

  return (
    <section className="panel-card p-4 md:p-5 mb-4" aria-labelledby="getting-started-title">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-emerald-400 shrink-0" aria-hidden />
          <h2 id="getting-started-title" className="text-sm font-semibold">
            Getting started
          </h2>
          <span className="text-xs text-text-secondary tabular-nums">
            {done} of {total}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 -m-1 rounded text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Hide getting started"
        >
          <X size={15} />
        </button>
      </div>

      <ul className="space-y-1">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onStep(step.id)}
              disabled={step.done}
              className={`w-full flex items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                step.done ? 'cursor-default' : 'hover:bg-bg-tertiary/50'
              }`}
            >
              {step.done ? (
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
              ) : (
                <Circle size={15} className="mt-0.5 shrink-0 text-text-secondary/60" aria-hidden />
              )}
              <span className="min-w-0">
                <span
                  className={`block text-sm ${
                    step.done ? 'text-text-secondary line-through' : 'text-text-primary font-medium'
                  }`}
                >
                  {step.label}
                </span>
                {!step.done && (
                  <span className="block text-xs text-text-secondary leading-snug mt-0.5">{step.hint}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
