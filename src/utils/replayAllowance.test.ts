import { describe, expect, it } from 'vitest';
import {
  allowanceShares,
  dailyAllowanceUsd,
  daysInMonth,
  ledgerState,
  PENDING_TTL_MS,
  replayRoom,
  replayUsedLabel,
} from './replayAllowance';
import { limitsFor, TIER_ORDER } from '../config/tiers';

/* A member's market replay data: $20 a month, split evenly across its days. */

const empty = { dayUsd: 0, monthUsd: 0, pendingUsd: 0 };

describe('the replay allowance', () => {
  it('is $20 a month on Diamond and nothing on any other plan', () => {
    for (const tier of TIER_ORDER) expect(limitsFor(tier).replayUsdPerMonth).toBe(tier === 'diamond' ? 20 : 0);
  });

  it('splits the month evenly by its own length', () => {
    expect(daysInMonth('2026-10-20')).toBe(31);
    expect(daysInMonth('2026-11-03')).toBe(30);
    expect(daysInMonth('2028-02-10')).toBe(29);
    expect(dailyAllowanceUsd(20, '2026-11-03')).toBeCloseTo(20 / 30, 9);
    expect(dailyAllowanceUsd(0, '2026-11-03')).toBe(0);
  });

  it('carries nothing forward: on the 20th an untouched month still opens only one day’s share', () => {
    // It used to open 20/31 of the month here — $12.90 in one day.
    const day = '2026-10-20';
    expect(replayRoom({ ...empty, dayUsd: 0.64 }, 20, day)).toEqual({ ok: true });
    expect(replayRoom({ ...empty, dayUsd: 0.65 }, 20, day)).toEqual({ ok: false, reason: 'day' });
  });

  it('stops at the month’s total even when today is untouched', () => {
    expect(replayRoom({ ...empty, monthUsd: 20 }, 20, '2026-10-31')).toEqual({ ok: false, reason: 'month' });
    expect(replayRoom({ ...empty, monthUsd: 19.99 }, 20, '2026-10-31')).toEqual({ ok: true });
  });

  it('counts pulls already in flight, so simultaneous requests cannot each slip under', () => {
    const day = '2026-10-20';
    expect(replayRoom({ ...empty, dayUsd: 0.5 }, 20, day)).toEqual({ ok: true });
    expect(replayRoom({ ...empty, dayUsd: 0.5, pendingUsd: 0.2 }, 20, day)).toEqual({ ok: false, reason: 'day' });
    expect(replayRoom({ ...empty, monthUsd: 19.9, pendingUsd: 0.2 }, 20, day)).toEqual({ ok: false, reason: 'month' });
  });

  it('allows nothing on a plan with no allowance', () => {
    expect(replayRoom(empty, 0, '2026-10-20')).toEqual({ ok: false, reason: 'month' });
  });
});

describe('reading the ledger', () => {
  const now = Date.parse('2026-10-20T15:00:00Z');

  it('reads today’s and the month’s spend, and only the reservations still live', () => {
    const { state, live } = ledgerState(
      {
        usd: 3.51,
        days: { '2026-10-19': 1, '2026-10-20': 0.4 },
        pending: {
          fresh: { usd: 0.15, at: new Date(now - 5_000).toISOString() },
          dead: { usd: 9, at: new Date(now - PENDING_TTL_MS - 1).toISOString() },
          broken: { usd: 1, at: 'yesterday' },
        },
      },
      '2026-10-20',
      now,
    );
    expect(state).toEqual({ dayUsd: 0.4, monthUsd: 3.51, pendingUsd: 0.15 });
    expect(Object.keys(live)).toEqual(['fresh']);
  });

  it('reads an empty or malformed document as nothing spent', () => {
    expect(ledgerState(undefined, '2026-10-20', now).state).toEqual(empty);
    expect(ledgerState({ usd: 'lots', days: 'x', pending: 3 }, '2026-10-20', now).state).toEqual(empty);
  });
});

describe('what the screens say', () => {
  it('reports today and the month as shares of their allowances', () => {
    const s = allowanceShares({ dayUsd: 0.31, monthUsd: 5, pendingUsd: 0 }, 20, '2026-10-20');
    expect(s.today).toBeCloseTo(0.31 / (20 / 31), 9);
    expect(s.month).toBe(0.25);
    expect(allowanceShares({ dayUsd: 9, monthUsd: 90, pendingUsd: 0 }, 20, '2026-10-20')).toEqual({ today: 1, month: 1 });
  });

  it('says "under 1%" rather than a misleading 0%', () => {
    expect(replayUsedLabel(0)).toBe('none');
    expect(replayUsedLabel(0.004)).toBe('under 1%');
    expect(replayUsedLabel(0.25)).toBe('25%');
  });
});
