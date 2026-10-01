import { describe, expect, it } from 'vitest';
import { daysRemaining, decideNudge, liveTrial, nudgeKey } from '../../server/trialNudges';
import { DAY_MS } from '../config/accessExtension';
import { TRIAL_DAYS } from '../config/trial';
import type { Entitlement } from '../../server/entitlements';

/*
 * These used to build a record with `comp: { trial: true }` — the shape a second, self-serve trial
 * endpoint wrote, which nothing ever called. Every case passed, and the sequence had never sent an
 * email to a human being. The trial that actually runs is Creem's: an ordinary active subscription
 * with trialStartedAt and trialEndsAt written by the webhook.
 */

const NOW = Date.parse('2026-09-08T15:00:00.000Z');
const at = (days: number) => new Date(NOW + days * DAY_MS).toISOString();

/** A Creem trial that started `startedDaysAgo` ago and runs the standard length. */
const onTrial = (startedDaysAgo: number, extra: Partial<Entitlement> = {}): Entitlement => ({
  tier: 'silver',
  source: 'purchase',
  status: 'active',
  creemSubscriptionId: 'sub_1',
  updatedAt: at(-startedDaysAgo),
  trialStartedAt: at(-startedDaysAgo),
  trialEndsAt: at(TRIAL_DAYS - startedDaysAgo),
  ...extra,
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
    const sent = { [nudgeKey('ending', entitlement.trialEndsAt!)]: at(0) };
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

describe('the unsubscribe only silences the one note that is not about money', () => {
  /*
   * The welcome is a nudge. The other two say when a card is charged and how to stop it, which is
   * the same reason the broker-link notices carry no unsubscribe link either: being able to opt out
   * of a warning and then be surprised by what it warned about serves nobody.
   */
  it('drops the welcome for somebody who used the link', () => {
    expect(decideNudge({ entitlement: onTrial(1), optedOut: true, now: NOW }).send).toBe(false);
  });

  it('still warns them about the charge', () => {
    expect(decideNudge({ entitlement: onTrial(5), optedOut: true, now: NOW })).toMatchObject({
      send: true,
      stage: 'ending',
    });
    expect(decideNudge({ entitlement: onTrial(6), optedOut: true, now: NOW })).toMatchObject({
      send: true,
      stage: 'last-day',
    });
  });
});

describe('whether the card is actually going to be charged', () => {
  /*
   * The one thing in this file that is worse to get wrong in either direction. "You will be
   * charged" to somebody who cancelled reads as us ignoring the cancellation; silence to somebody
   * who did not is the surprise charge itself.
   */
  it('says it will, while the subscription is live', () => {
    expect(decideNudge({ entitlement: onTrial(5), now: NOW })).toMatchObject({ willCharge: true });
  });

  it('says it will not, once the subscription says cancelled', () => {
    const cancelled = onTrial(5, { status: 'canceled' });
    expect(decideNudge({ entitlement: cancelled, now: NOW })).toMatchObject({ willCharge: false });
    // Still written to: the trial runs to its end date either way, and the last-day note is where
    // they are told what happens next.
    expect(decideNudge({ entitlement: cancelled, now: NOW }).send).toBe(true);
  });
});

describe('who gets counted down at', () => {
  it('nobody, when the trial has already ended', () => {
    expect(decideNudge({ entitlement: onTrial(TRIAL_DAYS + 1), now: NOW }).send).toBe(false);
  });

  it('nobody, on an ordinary subscription that was never a trial', () => {
    const paying: Entitlement = { tier: 'silver', source: 'purchase', status: 'active', updatedAt: at(-30) };
    expect(decideNudge({ entitlement: paying, now: NOW }).send).toBe(false);
    expect(decideNudge({ entitlement: null, now: NOW }).send).toBe(false);
  });

  it('nobody, on a gift — a comp granted by hand is not a trial', () => {
    /*
     * The reaper spares both, but only one of them is something to count down at somebody. Written
     * as a record that WOULD have matched the old comp-shaped rule, so this case still covers the
     * thing it was written for rather than passing because liveTrial returns null for everything.
     */
    const gift: Entitlement = {
      tier: 'free',
      source: 'admin',
      status: 'active',
      updatedAt: at(-5),
      comp: { tier: 'silver', until: at(2), grantedBy: 'admin', grantedAt: at(-5) },
    };
    expect(liveTrial(gift, NOW)).toBeNull();
    expect(decideNudge({ entitlement: gift, now: NOW }).send).toBe(false);
  });

  it('nobody, on a half-written record with one date and not the other', () => {
    // The webhook writes both together, so one without the other is a record mid-flight or
    // hand-edited. Counting down from an unknown start would mis-time every stage.
    expect(liveTrial(onTrial(5, { trialStartedAt: null }), NOW)).toBeNull();
    expect(liveTrial(onTrial(5, { trialEndsAt: null }), NOW)).toBeNull();
  });

  it('finds the trial it is meant to find', () => {
    // The guard on the guards above: four of them assert null, and would all pass against a
    // liveTrial that never returned anything.
    expect(liveTrial(onTrial(5), NOW)).toMatchObject({ endsAt: at(2), willCharge: true });
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
