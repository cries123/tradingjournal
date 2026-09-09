import { describe, expect, it } from 'vitest';
import { chargeAmount, isPaymentEvent } from '../../server/billingLedger';
import { TIER_PLANS } from '../config/tiers';
import { amountFromEvent, parseBillingEvent } from '../../server/creemClient';

/**
 * Which webhook events count as money.
 *
 * The distinction the ledger rests on: a subscription becoming active is a state change, and only
 * some state changes involved a charge. Booking revenue on the wrong one inflates every month.
 */
describe('isPaymentEvent', () => {
  it('books a payment', () => {
    expect(isPaymentEvent('subscription.paid')).toBe(true);
    expect(isPaymentEvent('checkout.completed')).toBe(true);
    expect(isPaymentEvent('SUBSCRIPTION.PAID')).toBe(true);
  });

  it('does not book a subscription merely turning active', () => {
    // A resumed or trial-converted subscription flips to active without charging anything.
    expect(isPaymentEvent('subscription.active')).toBe(false);
    expect(isPaymentEvent('subscription.updated')).toBe(false);
  });

  it('does not book cancellations, lapses or failures', () => {
    expect(isPaymentEvent('subscription.canceled')).toBe(false);
    expect(isPaymentEvent('subscription.expired')).toBe(false);
    expect(isPaymentEvent('subscription.past_due')).toBe(false);
    expect(isPaymentEvent('subscription.unpaid')).toBe(false);
  });

  it('books nothing for a missing or empty type', () => {
    expect(isPaymentEvent(undefined)).toBe(false);
    expect(isPaymentEvent('')).toBe(false);
  });
});

describe('the substring trap', () => {
  it('never books an unpaid event, whose name contains "paid"', () => {
    expect(isPaymentEvent('subscription.unpaid')).toBe(false);
    expect(isPaymentEvent('invoice.unpaid')).toBe(false);
  });

  it('never books a refund or a failed charge', () => {
    expect(isPaymentEvent('payment.refunded')).toBe(false);
    expect(isPaymentEvent('payment.failed')).toBe(false);
  });
});

describe('what a webhook says was actually collected', () => {
  const event = (object: Record<string, unknown> | null) => ({ eventType: 'checkout.completed', object }) as never;

  it('reads the amount in dollars from cents', () => {
    expect(amountFromEvent(event({ amount_paid: 900 }))).toBe(9);
    expect(amountFromEvent(event({ amount_total: 1900 }))).toBe(19);
    expect(amountFromEvent(event({ amount: 3900 }))).toBe(39);
    expect(amountFromEvent(event({ total: 900 }))).toBe(9);
  });

  it('finds it on a nested order too', () => {
    expect(amountFromEvent(event({ order: { amount_paid: 1900 } }))).toBe(19);
  });

  it('prefers what was paid over what was billed', () => {
    // A fully discounted first month bills $9 and collects nothing. The ledger tracks the bank.
    expect(amountFromEvent(event({ amount_paid: 0, amount_total: 900 }))).toBe(0);
  });

  it('reports zero as zero, not as nothing', () => {
    // The distinction the whole fix rests on: a trial starting is a real charge of nothing, and
    // must not fall through to the plan's list price.
    expect(amountFromEvent(event({ amount_paid: 0 }))).toBe(0);
    expect(amountFromEvent(event({ order: { amount_total: 0 } }))).toBe(0);
  });

  it('says nothing when the event carries no amount at all', () => {
    expect(amountFromEvent(event({ id: 'sub_1' }))).toBeNull();
    expect(amountFromEvent(event(null))).toBeNull();
    expect(amountFromEvent(event({ amount_paid: 'nine' as unknown as number }))).toBeNull();
    expect(amountFromEvent(event({ order: 'ord_1' }))).toBeNull();
  });
});

describe('what gets booked', () => {
  it('books nothing for a trial that collected nothing', () => {
    // The whole reason this is a function: `amountPaid || price` reads fine and books $9 here,
    // because zero is falsy. A Creem product with a free trial makes this the common case.
    expect(chargeAmount('silver', 0)).toBe(0);
  });

  it('books what was collected when the event says', () => {
    expect(chargeAmount('silver', 9)).toBe(9);
    expect(chargeAmount('gold', 4.5)).toBe(4.5);
    // A discounted first month is worth what it was worth, not what the plan lists.
    expect(chargeAmount('diamond', 19.5)).toBe(19.5);
  });

  it('falls back to the plan only when the event carried no amount at all', () => {
    expect(chargeAmount('silver', null)).toBe(TIER_PLANS.silver.price);
    expect(chargeAmount('gold')).toBe(TIER_PLANS.gold.price);
    expect(chargeAmount('diamond', Number.NaN)).toBe(TIER_PLANS.diamond.price);
  });

  it('books nothing at all for free, which is never a sale', () => {
    expect(chargeAmount('free')).toBe(0);
  });
});

/*
 * Every event Creem is actually configured to send, mapped.
 *
 * This list is the 14 enabled in the dashboard. The failure it guards against is silent: an event
 * that maps to null is ignored, so getting one wrong does not throw or log — it just leaves
 * somebody on the wrong plan until they complain.
 */
describe('the events Creem sends', () => {
  const map = (eventType: string) =>
    parseBillingEvent({ eventType, object: { id: 'x', metadata: { uid: 'u1', tier: 'silver' } } } as never)
      ?.status ?? null;

  it('treats a trial as active, which is the whole trial path now', () => {
    // A trial subscription sits in this state for its entire first week. Left unmapped, somebody
    // who just handed over a card would be looking at the paywall they paid to get past.
    expect(map('subscription.trialing')).toBe('active');
  });

  it('grants access for every event that means they are paid up', () => {
    expect(map('checkout.completed')).toBe('active');
    expect(map('subscription.active')).toBe('active');
    expect(map('subscription.paid')).toBe('active');
  });

  it('revokes for every event that means they are not', () => {
    expect(map('subscription.canceled')).toBe('canceled');
    expect(map('subscription.expired')).toBe('expired');
    expect(map('subscription.past_due')).toBe('past_due');
    expect(map('subscription.unpaid')).toBe('past_due');
  });

  it('ends a paused subscription at the period, not on the spot', () => {
    expect(map('subscription.paused')).toBe('canceled');
  });

  it('leaves a scheduled cancellation alone — they are still paying today', () => {
    // The trap in matching 'cancel' instead of 'canceled': this fires the moment somebody clicks
    // cancel, and would take the plan away weeks before the period they paid for runs out.
    expect(map('subscription.scheduled_cancel')).toBeNull();
  });

  it('ignores the bookkeeping ones rather than guessing', () => {
    for (const type of ['subscription.update', 'refund.created', 'dispute.created', 'customer_credits.exhausted']) {
      expect(map(type)).toBeNull();
    }
  });
});
