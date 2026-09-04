import { describe, expect, it } from 'vitest';
import { daysRemaining, decideNudge, liveTrial, nudgeKey } from '../../server/trialNudges';
import { DAY_MS } from '../config/accessExtension';
import { TRIAL_DAYS } from '../config/trial';
import type { Entitlement } from '../../server/entitlements';

const NOW = Date.parse('2026-09-08T15:00:00.000Z');
const at = (days: number) => new Date(NOW + days * DAY_MS).toISOString();

/** A trial that started `startedDaysAgo` ago and runs the standard length. */
const onTrial = (startedDaysAgo: number, extra: Record<string, unknown> = {}): Entitlement => ({
  tier: 'free',
  source: 'purchase',
  status: 'active',
  updatedAt: at(-startedDaysAgo),
  comp: {
    tier: 'silver',
    until: at(TRIAL_DAYS - startedDaysAgo),
    grantedBy: 'trial',
    grantedAt: at(-startedDaysAgo),
    trial: true,
    ...extra,
  },
});

describe('which note is due', () => {
  it('says nothing on the day it starts — the app has just told them on screen', () => {
    expect(decideNudge({ entitlement: onTrial(0), now: NOW }).send).toBe(false);
  });

  it('welcomes them the day after', () => {
    const decision = decideNudge({ entitlement: onTrial(1), now: NOW });
    expect(decision).toMatchObject({ send: true, stage: 'started' });
  });

  it('says nothing in the quiet middle', () => {
    expect(decideNudge({ entitlement: onTrial(3), sent: { [nudgeKey('started', at(4))]: at(-2) }, now: NOW }).send)
      .toBe(false);
  });

  it('warns with two days left', () => {
    const decision = decideNudge({ entitlement: onTrial(5), now: NOW });
    expect(decision).toMatchObject({ send: true, stage: 'ending', daysLeft: 2 });
  });

  it('writes again on the last day', () => {
    const decision = decideNudge({ entitlement: onTrial(6), now: NOW });
    expect(decision).toMatchObject({ send: true, stage: 'last-day', daysLeft: 1 });
  });

  it('prefers the last day over a welcome that never went out', () => {
    // A trial reaching its final morning should hear that, not a getting-started note because
    // the first one happened to fail earlier in the week.
    const decision = decideNudge({ entitlement: onTrial(6.5), now: NOW });
    expect(decision).toMatchObject({ send: true, stage: 'last-day' });
  });

  it('sends each stage once', () => {
    const entitlement = onTrial(5);
    const endsAt = entitlement.comp!.until;
    const sent = { [nudgeKey('ending', endsAt)]: at(0) };
    expect(decideNudge({ entitlement, sent, now: NOW }).send).toBe(false);
  });

  it('gives a second trial its own notes rather than skipping them', () => {
    // Keyed by the trial's own end date, so an admin extending somebody does not silently
    // suppress every note because the first trial was already written about.
    const entitlement = onTrial(5);
    const staleKey = nudgeKey('ending', at(-99));
    expect(decideNudge({ entitlement, sent: { [staleKey]: at(-99) }, now: NOW }).send).toBe(true);
  });
});

describe('who gets counted down at', () => {
  it('nobody, when the trial has already ended', () => {
    expect(decideNudge({ entitlement: onTrial(TRIAL_DAYS + 1), now: NOW }).send).toBe(false);
  });

  it('nobody, on a plan with no complimentary access at all', () => {
    const paying: Entitlement = { tier: 'silver', source: 'purchase', status: 'active', updatedAt: at(-30) };
    expect(decideNudge({ entitlement: paying, now: NOW }).send).toBe(false);
    expect(decideNudge({ entitlement: null, now: NOW }).send).toBe(false);
  });

  it('nobody, on a gift — a comp granted by hand is not a trial', () => {
    // The reaper spares both, but only one of them is something to count down at somebody.
    const gift = onTrial(5);
    delete gift.comp!.trial;
    expect(liveTrial(gift, NOW)).toBeNull();
    expect(decideNudge({ entitlement: gift, now: NOW }).send).toBe(false);
  });
});

describe('days remaining', () => {
  it('rounds up, so an hour left is a day and never zero', () => {
    expect(daysRemaining(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe(1);
    expect(daysRemaining(at(2), NOW)).toBe(2);
  });

  it('floors at zero once it has passed', () => {
    expect(daysRemaining(at(-3), NOW)).toBe(0);
  });
});
