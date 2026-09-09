import { describe, expect, it } from 'vitest';
import { chargeAmount, isPaymentEvent } from '../../server/billingLedger';
import { TIER_PLANS } from '../config/tiers';
import { amountFromEvent } from '../../server/creemClient';

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
