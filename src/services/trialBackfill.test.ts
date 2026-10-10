import { describe, expect, it, vi } from 'vitest';
import { backfillTrialMarkers, needsTrialCheck, type TrialBackfillDeps } from '../../server/trialBackfill';
import type { Entitlement } from '../../server/entitlements';

/*
 * A trial the webhook never marked gets no emails — including the one saying when the card is
 * charged. This asks Creem once per paying account and writes what the webhook would have.
 */

const NOW = '2026-10-10T15:00:00.000Z';
const IN_FIVE_DAYS = '2026-10-15T15:00:00.000Z';

const paying = (over: Partial<Entitlement> = {}): Entitlement => ({
  tier: 'gold',
  source: 'purchase',
  status: 'active',
  creemSubscriptionId: 'sub_1',
  updatedAt: NOW,
  ...over,
});

function harness(entitlements: Record<string, Entitlement>, subs: Record<string, { status?: string; current_period_end_date?: string } | Error>) {
  const writes: Record<string, Partial<Entitlement>> = {};
  const fetchSubscription = vi.fn(async (id: string) => {
    const s = subs[id];
    if (s instanceof Error) throw s;
    return s ?? {};
  });
  const rememberTrial = vi.fn(async () => undefined);
  const deps: TrialBackfillDeps = {
    candidates: async () => Object.entries(entitlements).map(([uid, entitlement]) => ({ uid, entitlement })),
    fetchSubscription,
    write: async (uid, patch) => {
      writes[uid] = { ...(writes[uid] ?? {}), ...patch };
    },
    rememberTrial,
    nowIso: NOW,
  };
  return { deps, writes, fetchSubscription, rememberTrial };
}

describe('a trial the webhook missed', () => {
  it('is marked exactly as the webhook would have marked it', async () => {
    const h = harness({ u1: paying() }, { sub_1: { status: 'trialing', current_period_end_date: IN_FIVE_DAYS } });

    const result = await backfillTrialMarkers(h.deps);

    expect(result).toEqual({ checked: 1, found: 1, failed: 0 });
    expect(h.writes.u1).toEqual({ trialStartedAt: NOW, trialEndsAt: IN_FIVE_DAYS, trialCheckedAt: NOW });
    expect(h.rememberTrial).toHaveBeenCalledWith('u1');
  });

  it('refuses an end date no trial could have, like the webhook does', () => {
    // trialPatch's window guards against re-arming a countdown on someone already charged.
    const h = harness({ u1: paying() }, { sub_1: { status: 'trialing', current_period_end_date: '2026-11-10T15:00:00.000Z' } });
    return backfillTrialMarkers(h.deps).then(() => {
      expect(h.writes.u1.trialEndsAt).toBeUndefined();
      expect(h.writes.u1.trialStartedAt).toBe(NOW);
    });
  });
});

describe('a paying subscription', () => {
  it('is looked up once and stamped, so it is never asked about again', async () => {
    const h = harness({ u1: paying() }, { sub_1: { status: 'active' } });
    await backfillTrialMarkers(h.deps);

    expect(h.writes.u1).toEqual({ trialCheckedAt: NOW });
    expect(needsTrialCheck({ ...paying(), ...h.writes.u1 })).toBe(false);
    expect(h.rememberTrial).not.toHaveBeenCalled();
  });
});

describe('who is asked about at all', () => {
  it('skips anything without a Creem subscription to read', () => {
    expect(needsTrialCheck(paying({ source: 'admin' }))).toBe(false);
    expect(needsTrialCheck(paying({ creemSubscriptionId: undefined }))).toBe(false);
    expect(needsTrialCheck(paying({ status: 'canceled' }))).toBe(false);
    expect(needsTrialCheck(null)).toBe(false);
  });

  it('skips a trial the webhook already marked', () => {
    expect(needsTrialCheck(paying({ trialStartedAt: NOW }))).toBe(false);
  });

  it('asks about a live purchase nobody has checked', () => {
    expect(needsTrialCheck(paying())).toBe(true);
  });

  it('stops at the per-run ceiling', async () => {
    const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`u${i}`, paying({ creemSubscriptionId: `sub_${i}` })]));
    const h = harness(many, {});
    h.deps.maxPerRun = 2;
    await backfillTrialMarkers(h.deps);
    expect(h.fetchSubscription).toHaveBeenCalledTimes(2);
  });
});

describe('a Creem lookup that fails', () => {
  it('leaves the account unstamped so tomorrow tries again', async () => {
    const h = harness({ u1: paying() }, { sub_1: new Error('502') });
    const result = await backfillTrialMarkers(h.deps);

    expect(result.failed).toBe(1);
    expect(h.writes.u1).toBeUndefined();
  });
});
