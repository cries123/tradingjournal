/**
 * What somebody has actually done with the journal, and what is worth doing next.
 *
 * Twenty of the first thirty-three signups had no trades at all. They arrived, made an account,
 * and never got to the point where the product does anything — which no amount of pricing work
 * fixes, because there is nothing to buy until it has been useful once.
 *
 * The list is deliberately short and disappears when it is done. A checklist that lingers after
 * you have finished it stops being help and starts being clutter.
 */

export type OnboardingStepId = 'log-trade' | 'connect-broker' | 'review-day' | 'set-rules';

export interface OnboardingState {
  tradeCount: number;
  brokerConnected: boolean;
  /** They have written a note on a trade, so they are reviewing rather than only recording. */
  hasTradeNote: boolean;
  /** They have set their own risk limits, which is what the discipline stats measure against. */
  hasRiskRules: boolean;
  /** Broker sync is on their plan (or their trial), so offering it is not a dead end. */
  canConnectBroker: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  hint: string;
  done: boolean;
}

/**
 * The steps, in the order they pay off.
 *
 * Logging one trade comes first because every other number in the product is derived from it, and
 * because it is the fastest thing on the list. Connecting a broker is second and only appears
 * when it would work — a locked step in a getting-started list reads as a bait and switch.
 */
export function onboardingSteps(state: OnboardingState): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    {
      id: 'log-trade',
      label: 'Log your first trade',
      hint: 'Everything else — the calendar, the stats, the grading — is built from these.',
      done: state.tradeCount > 0,
    },
  ];

  if (state.canConnectBroker) {
    steps.push({
      id: 'connect-broker',
      label: 'Connect your brokerage',
      hint: 'Your fills import themselves, matched into round trips with fees worked out.',
      done: state.brokerConnected,
    });
  }

  steps.push(
    {
      id: 'review-day',
      label: 'Write a note on one of your trades',
      hint: 'The habit that makes a journal worth keeping: what you saw, and what you would do again.',
      done: state.hasTradeNote,
    },
    {
      id: 'set-rules',
      label: 'Set your risk rules',
      hint: 'A daily loss limit and a max trade count, so the app can tell you when you broke them.',
      done: state.hasRiskRules,
    },
  );

  return steps;
}

/** How far along they are. `complete` is what decides whether the card shows at all. */
export function onboardingProgress(steps: OnboardingStep[]): {
  done: number;
  total: number;
  complete: boolean;
  next: OnboardingStep | null;
} {
  const done = steps.filter((s) => s.done).length;
  return {
    done,
    total: steps.length,
    complete: done === steps.length,
    next: steps.find((s) => !s.done) ?? null,
  };
}
