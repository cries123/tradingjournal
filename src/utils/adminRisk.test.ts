import { describe, expect, it } from 'vitest';
import {
  dormantSubscribers,
  DORMANT_DAYS,
  moneyAtRisk,
  mrrMovement,
  trialStats,
} from './adminRisk';
import type { AdminEntitlementView } from '../services/adminEntitlements';
import type { AdminUserSummary } from '../services/admin';
import type { MonthCosts } from '../services/adminCosts';
import { DAY_MS } from '../config/accessExtension';
import { TIER_PLANS } from '../config/tiers';

const NOW = Date.parse('2026-10-01T15:00:00.000Z');
const at = (days: number) => new Date(NOW + days * DAY_MS).toISOString();

const user = (uid: string, over: Partial<AdminUserSummary> = {}): AdminUserSummary =>
  ({
    uid,
    email: `${uid}@example.com`,
    username: uid,
    lastLoginAt: at(-1),
    createdAt: at(-90),
    tradeCount: 20,
    lastTradeDate: '2026-09-30',
    lastTradeActivityAt: at(-1),
    firstTradeDate: '2026-07-01',
    totalPnl: 100,
    winRate: 50,
    tradesSavedLast7Days: 3,
    tradesSessionLast7Days: 3,
    suspended: false,
    ...over,
  }) as AdminUserSummary;

const plan = (over: Partial<AdminEntitlementView> = {}): AdminEntitlementView =>
  ({ tier: 'silver', source: 'purchase', status: 'active', ...over }) as AdminEntitlementView;

const map = (entries: [string, AdminEntitlementView][]) => new Map(entries);
const allConnected = () => true;
const noneConnected = () => false;

describe('money at risk', () => {
  it('puts a declined card first, and above everything with a date', () => {
    /*
     * The only kind with no date — Creem retries on its own schedule and does not tell us when — and
     * the only one where the money has ALREADY stopped. Everything else is a deadline.
     */
    const rows = moneyAtRisk(
      [user('a'), user('b')],
      map([
        ['a', plan({ status: 'canceled', currentPeriodEnd: at(2) })],
        ['b', plan({ status: 'past_due' })],
      ]),
      allConnected,
      NOW,
    );

    expect(rows.map((r) => r.kind)).toEqual(['card-declined', 'leaving']);
    expect(rows[0].uid).toBe('b');
  });

  it('values the row at what the plan bills, so the list can be totalled', () => {
    const rows = moneyAtRisk([user('a')], map([['a', plan({ tier: 'gold', status: 'past_due' })]]), allConnected, NOW);
    expect(rows[0].value).toBe(TIER_PLANS.gold.price);
  });

  it('flags a trial with no brokerage connected, which is the one that will not convert', () => {
    // Broker sync is the only thing this product charges for. Reaching the end of a trial without
    // connecting means never having seen what the bill is for.
    const rows = moneyAtRisk([user('a')], map([['a', plan({ trialEndsAt: at(3) })]]), noneConnected, NOW);

    expect(rows[0]).toMatchObject({ kind: 'trial-not-connected', daysAway: 3 });
    // Nothing is being paid yet, so nothing is at stake in money terms.
    expect(rows[0].value).toBe(0);
  });

  it('says nothing about a trial that has connected and is running fine', () => {
    expect(moneyAtRisk([user('a')], map([['a', plan({ trialEndsAt: at(3) })]]), allConnected, NOW)).toEqual([]);
  });

  it('separates a cancelled trial from a trial that is merely unconnected', () => {
    const rows = moneyAtRisk(
      [user('a')],
      map([['a', plan({ status: 'canceled', trialEndsAt: at(2), currentPeriodEnd: at(2) })]]),
      noneConnected,
      NOW,
    );
    // One row, not two: a cancelled trial is not also a lapsing subscription.
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('trial-cancelled');
  });

  it('leaves a hand-granted plan alone — nobody is paying, so nothing is at risk', () => {
    const rows = moneyAtRisk(
      [user('a')],
      map([['a', plan({ source: 'admin', status: 'past_due' })]]),
      allConnected,
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it('drops a subscription that has already run out', () => {
    // History, not risk. The row exists for the window where they can still be kept.
    const rows = moneyAtRisk(
      [user('a')],
      map([['a', plan({ status: 'canceled', currentPeriodEnd: at(-3) })]]),
      allConnected,
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it('ranks by how bad it is before it ranks by how soon', () => {
    /*
     * The two orderings disagree here, which is the only way to tell them apart: a cancellation with
     * ten days left matters more than an unconnected trial with one, because one is money already
     * committed and the other is money that was never promised.
     */
    const rows = moneyAtRisk(
      [user('soon'), user('worse')],
      map([
        ['soon', plan({ trialEndsAt: at(1) })],
        ['worse', plan({ status: 'canceled', currentPeriodEnd: at(10) })],
      ]),
      noneConnected,
      NOW,
    );

    expect(rows.map((r) => r.kind)).toEqual(['leaving', 'trial-not-connected']);
  });

  it('sorts the soonest deadline first within a kind', () => {
    const rows = moneyAtRisk(
      [user('a'), user('b')],
      map([
        ['a', plan({ status: 'canceled', currentPeriodEnd: at(20) })],
        ['b', plan({ status: 'canceled', currentPeriodEnd: at(2) })],
      ]),
      allConnected,
      NOW,
    );
    expect(rows.map((r) => r.uid)).toEqual(['b', 'a']);
  });
});

describe('trial conversion', () => {
  const paid = (uids: string[]) => (uid: string) => uids.includes(uid);

  it('counts a finished trial that went on to pay as a conversion', () => {
    const stats = trialStats(
      map([
        ['a', plan({ trialStartedAt: at(-20), trialEndsAt: at(-13) })],
        ['b', plan({ trialStartedAt: at(-20), trialEndsAt: at(-13) })],
      ]),
      paid(['a']),
      NOW,
    );

    expect(stats).toMatchObject({ started: 2, converted: 1, lapsed: 1, live: 0, conversionRate: 50 });
  });

  it('leaves a running trial out of the rate entirely', () => {
    /*
     * Counting a live trial as a failure makes every healthy week look like a collapse, and counting
     * it as a success is a guess. It is neither until it finishes.
     */
    const stats = trialStats(
      map([
        ['a', plan({ trialStartedAt: at(-20), trialEndsAt: at(-13) })],
        ['b', plan({ trialStartedAt: at(-2), trialEndsAt: at(5) })],
      ]),
      paid(['a']),
      NOW,
    );

    expect(stats).toMatchObject({ started: 2, live: 1, converted: 1, lapsed: 0, conversionRate: 100 });
  });

  it('does not score a running trial as converted because the account paid once before', () => {
    /*
     * Reachable: somebody subscribes, cancels, comes back later and is given another trial. Their old
     * ledger row says they have paid, and the trial running today has decided nothing yet. Counting
     * it would make a second chance look like a conversion on the day it started.
     */
    const stats = trialStats(
      map([['a', plan({ trialStartedAt: at(-2), trialEndsAt: at(5) })]]),
      paid(['a']),
      NOW,
    );

    expect(stats).toMatchObject({ live: 1, converted: 0, lapsed: 0 });
  });

  it('has no rate at all until something has finished', () => {
    // Not 0%. A zero would read as "nobody converts" on the day the first trial starts.
    const stats = trialStats(map([['a', plan({ trialStartedAt: at(-1), trialEndsAt: at(6) })]]), paid([]), NOW);
    expect(stats.conversionRate).toBeNull();
  });

  it('reads payment from the ledger, never from the plan', () => {
    /*
     * A trialling account is status 'active' on a paid tier — the webhook maps trialing to active on
     * purpose — so "has a tier" would score every trial as converted the moment it started.
     */
    const entitlements = map([['a', plan({ trialStartedAt: at(-20), trialEndsAt: at(-13) })]]);
    expect(trialStats(entitlements, paid([]), NOW).converted).toBe(0);
    expect(trialStats(entitlements, paid(['a']), NOW).converted).toBe(1);
  });

  it('ignores accounts that never had one', () => {
    expect(trialStats(map([['a', plan()]]), paid(['a']), NOW).started).toBe(0);
  });
});

describe('MRR movement', () => {
  const month = (m: string, revenue: number): MonthCosts =>
    ({ month: m, counts: { revenue }, breakdown: {}, partial: false }) as MonthCosts;

  it('separates a first payment from a renewal', () => {
    const rows = mrrMovement(
      [month('2026-08', 18), month('2026-09', 27)],
      [
        { uid: 'a', at: '2026-08-04T00:00:00.000Z' },
        { uid: 'b', at: '2026-08-09T00:00:00.000Z' },
        { uid: 'a', at: '2026-09-04T00:00:00.000Z' },
        { uid: 'b', at: '2026-09-09T00:00:00.000Z' },
        { uid: 'c', at: '2026-09-20T00:00:00.000Z' },
      ],
    );

    expect(rows[0]).toMatchObject({ month: '2026-08', newCustomers: 2, churned: 0, net: 2 });
    expect(rows[1]).toMatchObject({ month: '2026-09', newCustomers: 1, churned: 0, net: 1 });
  });

  it('reads a month of silence as having stopped paying', () => {
    /*
     * Nothing records the moment somebody leaves — a cancelled subscription simply stops producing
     * charges — so this is the only measurable version. It lags a month, which is why the panel says
     * "stopped paying" rather than "churned".
     */
    const rows = mrrMovement(
      [month('2026-08', 18), month('2026-09', 9)],
      [
        { uid: 'a', at: '2026-08-04T00:00:00.000Z' },
        { uid: 'b', at: '2026-08-09T00:00:00.000Z' },
        { uid: 'a', at: '2026-09-04T00:00:00.000Z' },
      ],
    );

    expect(rows[1]).toMatchObject({ churned: 1, newCustomers: 0, net: -1 });
  });

  it('does not count a returning customer as new a second time', () => {
    const rows = mrrMovement(
      [month('2026-07', 9), month('2026-08', 0), month('2026-09', 9)],
      [
        { uid: 'a', at: '2026-07-04T00:00:00.000Z' },
        { uid: 'a', at: '2026-09-04T00:00:00.000Z' },
      ],
    );

    expect(rows[0].newCustomers).toBe(1);
    expect(rows[2].newCustomers).toBe(0);
  });

  it('walks the months oldest first whatever order they arrive in', () => {
    // The cost report hands them newest first. "Had they ever paid before" is only answerable in
    // the other direction, so a reversed input would call every customer new.
    const rows = mrrMovement(
      [month('2026-09', 9), month('2026-08', 9)],
      [
        { uid: 'a', at: '2026-08-04T00:00:00.000Z' },
        { uid: 'a', at: '2026-09-04T00:00:00.000Z' },
      ],
    );

    expect(rows.map((r) => r.month)).toEqual(['2026-08', '2026-09']);
    expect(rows[1].newCustomers).toBe(0);
  });

  it('survives a charge with no date or no uid', () => {
    const rows = mrrMovement([month('2026-09', 9)], [{ uid: '', at: '' }, { uid: 'a', at: 'nonsense' }]);
    expect(rows[0]).toMatchObject({ newCustomers: 0, churned: 0 });
  });
});

describe('dormant subscribers', () => {
  it('lists a paying account that has gone quiet', () => {
    const rows = dormantSubscribers(
      [user('a', { lastTradeActivityAt: at(-DORMANT_DAYS - 1) })],
      map([['a', plan()]]),
      NOW,
    );
    expect(rows[0]).toMatchObject({ uid: 'a', quietFor: DORMANT_DAYS + 1, value: TIER_PLANS.silver.price });
  });

  it('leaves somebody who traded this week alone', () => {
    expect(dormantSubscribers([user('a', { lastTradeActivityAt: at(-2) })], map([['a', plan()]]), NOW)).toEqual([]);
  });

  it('includes a subscriber who has never logged anything, at the top', () => {
    // The clearest case there is: paying, and has never used it.
    const rows = dormantSubscribers(
      [user('a', { lastTradeActivityAt: at(-30) }), user('b', { lastTradeActivityAt: null })],
      map([
        ['a', plan()],
        ['b', plan()],
      ]),
      NOW,
    );

    expect(rows.map((r) => r.uid)).toEqual(['b', 'a']);
    expect(rows[0].quietFor).toBeNull();
  });

  it('excludes free accounts, hand-granted plans and live trials', () => {
    /*
     * A free account owes nothing. A grant is not revenue to lose. A trial has not decided yet, and
     * it is already on the risk list — appearing on both would double-count the same person.
     */
    const quiet = { lastTradeActivityAt: at(-40) };
    const rows = dormantSubscribers(
      [user('free', quiet), user('granted', quiet), user('trialling', quiet), user('paying', quiet)],
      map([
        ['free', plan({ tier: 'free' })],
        ['granted', plan({ source: 'admin' })],
        ['trialling', plan({ trialEndsAt: at(4) })],
        ['paying', plan()],
      ]),
      NOW,
    );

    expect(rows.map((r) => r.uid)).toEqual(['paying']);
  });

  it('excludes a lapsed subscription, which is a different list', () => {
    const rows = dormantSubscribers(
      [user('a', { lastTradeActivityAt: at(-40) })],
      map([['a', plan({ status: 'past_due' })]]),
      NOW,
    );
    expect(rows).toEqual([]);
  });
});
