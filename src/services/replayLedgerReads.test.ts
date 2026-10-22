import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The two admin reads of the replay ledger: one member's spend for their profile, and a month's
 * spend per member for the Costs tab. Against an in-memory Firestore with equality queries.
 */

const store = new Map<string, Record<string, unknown>>();

vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));
vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    collection: (name: string) => ({
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: [...store.entries()]
            .filter(([path, d]) => path.startsWith(`${name}/`) && d[field] === value)
            .map(([, d]) => ({ data: () => d })),
        }),
      }),
    }),
  }),
}));

const NOW = new Date('2026-10-20T15:00:00Z');

beforeEach(() => {
  store.clear();
  store.set('replayMonths/ann_2026-10', {
    uid: 'ann',
    month: '2026-10',
    usd: 3.51,
    days: { '2026-10-19': 2.8, '2026-10-20': 0.71 },
    bytes: 13_700_000,
    symbols: 604,
    pulls: 51,
    estimatedPulls: 1,
  });
  // After October on purpose: an earlier month read last must not stand in for this one.
  store.set('replayMonths/ann_2026-09', { uid: 'ann', month: '2026-09', usd: 4, days: { '2026-09-30': 4 }, symbols: 9 });
  store.set('replayMonths/bob_2026-10', { uid: 'bob', month: '2026-10', usd: 0.4, days: { '2026-10-02': 0.4 } });
});

describe('one member’s replay spend', () => {
  it('reads today, this month, all time and the last day bought, and nobody else’s', async () => {
    const { readMemberReplayUsage } = await import('../../server/replayLedger');
    expect(await readMemberReplayUsage('ann', NOW)).toEqual({
      todayUsd: 0.71,
      monthUsd: 3.51,
      lifetimeUsd: 7.51,
      monthBytes: 13_700_000,
      monthSymbols: 604,
      monthPulls: 51,
      monthEstimatedPulls: 1,
      lastDay: '2026-10-20',
    });
  });

  it('reads somebody who never replayed as nothing spent and never bought', async () => {
    const { readMemberReplayUsage } = await import('../../server/replayLedger');
    expect(await readMemberReplayUsage('cat', NOW)).toMatchObject({ monthUsd: 0, lifetimeUsd: 0, lastDay: null });
  });
});

describe('a month’s replay spend, for the Costs tab', () => {
  it('adds every member’s month and keeps each member’s share', async () => {
    const { readReplayMonthCosts } = await import('../../server/replayLedger');
    const october = await readReplayMonthCosts('2026-10');
    expect(october.usd).toBeCloseTo(3.91, 9);
    expect([...october.perUser.entries()]).toEqual([
      ['ann', 3.51],
      ['bob', 0.4],
    ]);
    expect((await readReplayMonthCosts('2026-08')).usd).toBe(0);
  });
});
