import { describe, expect, it } from 'vitest';
import { onboardingProgress, onboardingSteps, type OnboardingState } from './onboardingSteps';

const state = (patch: Partial<OnboardingState> = {}): OnboardingState => ({
  tradeCount: 0,
  brokerConnected: false,
  hasTradeNote: false,
  hasRiskRules: false,
  canConnectBroker: false,
  ...patch,
});

describe('the getting-started list', () => {
  it('leads with logging a trade, because everything else is derived from one', () => {
    expect(onboardingSteps(state())[0].id).toBe('log-trade');
  });

  it('offers connecting a broker only when that would actually work', () => {
    const free = onboardingSteps(state()).map((s) => s.id);
    expect(free).not.toContain('connect-broker');

    // A locked step in a getting-started list reads as a bait and switch.
    const paid = onboardingSteps(state({ canConnectBroker: true })).map((s) => s.id);
    expect(paid).toContain('connect-broker');
  });

  it('ticks a step off from the thing it is actually about', () => {
    const steps = onboardingSteps(state({ tradeCount: 3, hasTradeNote: true }));
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.done]));
    expect(byId['log-trade']).toBe(true);
    expect(byId['review-day']).toBe(true);
    expect(byId['set-rules']).toBe(false);
  });

  it('counts one trade as having logged a trade', () => {
    expect(onboardingSteps(state({ tradeCount: 1 }))[0].done).toBe(true);
  });
});

describe('progress', () => {
  it('names the next thing to do', () => {
    const steps = onboardingSteps(state({ tradeCount: 5 }));
    expect(onboardingProgress(steps).next?.id).toBe('review-day');
  });

  it('is complete only when every step is, so the card can take itself away', () => {
    const partial = onboardingProgress(onboardingSteps(state({ tradeCount: 5, hasTradeNote: true })));
    expect(partial).toMatchObject({ done: 2, total: 3, complete: false });

    const all = onboardingProgress(
      onboardingSteps(state({ tradeCount: 5, hasTradeNote: true, hasRiskRules: true })),
    );
    expect(all).toMatchObject({ done: 3, total: 3, complete: true, next: null });
  });

  it('counts the broker step when it is on the list', () => {
    const steps = onboardingSteps(state({ canConnectBroker: true, tradeCount: 1 }));
    expect(onboardingProgress(steps).total).toBe(4);
  });
});
