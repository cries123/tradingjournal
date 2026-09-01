import { describe, expect, it } from 'vitest';
import { isPaymentEvent } from '../../server/billingLedger';

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
