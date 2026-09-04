import { describe, expect, it } from 'vitest';
import { decideTrial, TRIAL_DAYS, TRIAL_TIER, type TrialRecord } from '../config/trial';
import { DAY_MS } from '../config/accessExtension';
import { DEFAULT_GRACE_DAYS, decideReap } from '../../server/brokerReaper';
import type { Entitlement } from '../../server/entitlements';

/*
 * One trial per account, and only where a trial means something.
 *
 * The expensive failure here is the permissive one: broker sync costs real money per connected
 * person, so an account that can start a fresh trial whenever the last one runs out is an
 * unlimited free plan with an extra step.
 */

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const at = (days: number) => new Date(NOW + days * DAY_MS).toISOString();

const record = (patch: Partial<TrialRecord>): TrialRecord => ({
  tier: 'free',
  source: 'purchase',
  status: 'active',
  ...patch,
});

const comp = (untilDays: number, extra: Record<string, unknown> = {}) => ({
  tier: TRIAL_TIER,
  until: at(untilDays),
  grantedBy: 'trial',
  grantedAt: at(-1),
  ...extra,
});

describe('who can start a trial', () => {
  it('offers one to somebody who has never had a plan at all', () => {
    const decision = decideTrial(null, NOW);
    expect(decision).toEqual({
      eligible: true,
      tier: TRIAL_TIER,
      days: TRIAL_DAYS,
      until: at(TRIAL_DAYS),
    });
  });

  it('offers one to a free account with a record but no history', () => {
    expect(decideTrial(record({}), NOW).eligible).toBe(true);
  });

  it('refuses a second one, long after the first has expired', () => {
    // The whole point. Once the comp lapses this record looks exactly like a fresh free account
    // from every other angle, and trialStartedAt is the only thing that remembers.
    const used = record({ trialStartedAt: at(-90), comp: comp(-83) });
    const decision = decideTrial(used, NOW);
    expect(decision.eligible).toBe(false);
    if (decision.eligible) throw new Error('expected refusal');
    expect(decision.reason).toBe('already-used');
  });

  it('refuses while one is already running', () => {
    const running = record({ trialStartedAt: at(-2), comp: comp(5, { trial: true }) });
    expect(decideTrial(running, NOW).eligible).toBe(false);
  });

  it('refuses a paying subscriber — there is nothing to trial', () => {
    const decision = decideTrial(record({ tier: 'gold', status: 'active' }), NOW);
    expect(decision.eligible).toBe(false);
    if (decision.eligible) throw new Error('expected refusal');
    expect(decision.reason).toBe('already-paid');
  });

  it('refuses a hand-granted account', () => {
    const granted = record({ tier: 'diamond', source: 'admin', status: 'active' });
    expect(decideTrial(granted, NOW).eligible).toBe(false);
  });

  it('refuses someone already given complimentary access by hand', () => {
    const comped = record({ comp: comp(20) });
    const decision = decideTrial(comped, NOW);
    expect(decision.eligible).toBe(false);
    if (decision.eligible) throw new Error('expected refusal');
    expect(decision.reason).toBe('already-comped');
  });

  it('refuses a cancelled subscriber still inside the period they paid for', () => {
    const cancelled = record({ tier: 'silver', status: 'canceled', currentPeriodEnd: at(12) });
    expect(decideTrial(cancelled, NOW).eligible).toBe(false);
  });

  it('would offer one to a subscriber whose plan has fully lapsed, if they had never used it', () => {
    // Not a loophole: anyone who subscribed after trialling carries trialStartedAt, and the first
    // rule catches them. This covers the person who paid from day one and later lapsed.
    const lapsed = record({ tier: 'silver', status: 'canceled', currentPeriodEnd: at(-30) });
    expect(decideTrial(lapsed, NOW).eligible).toBe(true);

    const lapsedAfterTrial = record({ ...lapsed, trialStartedAt: at(-200) });
    expect(decideTrial(lapsedAfterTrial, NOW).eligible).toBe(false);
  });

  it('checks the history before anything else, so the answer never changes with time', () => {
    const used = record({ tier: 'gold', status: 'active', trialStartedAt: at(-10) });
    const decision = decideTrial(used, NOW);
    if (decision.eligible) throw new Error('expected refusal');
    // Not 'already-paid' — they may cancel tomorrow, and the answer must stay the same.
    expect(decision.reason).toBe('already-used');
  });
});

describe('what a trial grants', () => {
  it('runs for exactly the advertised number of days', () => {
    const decision = decideTrial(null, NOW);
    if (!decision.eligible) throw new Error('expected eligible');
    expect(Date.parse(decision.until) - NOW).toBe(TRIAL_DAYS * DAY_MS);
  });

  it('grants a tier that actually includes broker sync, which is the point of it', () => {
    expect(TRIAL_TIER).not.toBe('free');
  });
});

describe('the trial and the reaper agree', () => {
  it('spares the broker link while the trial runs, and takes it back after', () => {
    const started = record({ trialStartedAt: at(0), comp: comp(TRIAL_DAYS, { trial: true }) });
    const asEntitlement = { ...started, updatedAt: at(0) } as Entitlement;

    // Day 3 of 7: untouchable.
    expect(decideReap({ entitlement: asEntitlement, now: NOW + 3 * DAY_MS }).action).toBe('keep');

    // The day it lapses: the clock starts, nothing is removed yet.
    expect(decideReap({ entitlement: asEntitlement, now: NOW + (TRIAL_DAYS + 1) * DAY_MS }).action)
      .toBe('wait');

    // Past the grace period: gone, and the reason names the trial rather than a billing failure.
    const after = decideReap({
      entitlement: asEntitlement,
      now: NOW + (TRIAL_DAYS + DEFAULT_GRACE_DAYS + 1) * DAY_MS,
    });
    expect(after.action).toBe('reap');
    if (after.action !== 'reap') throw new Error('expected reap');
    expect(after.reason).toBe('complimentary access ended');
    // Counted from when the trial ended, not from when the job noticed.
    expect(after.lapsedAt).toBe(at(TRIAL_DAYS));
  });
});
