import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The terms of service and the refund policy both tell people that cancelling happens "from
 * Settings". For months it did not: Settings had no plan section and no billing link, and the only
 * route to the portal was a sentence under the pricing table. Somebody following our own written
 * promise arrived at Settings and found nothing.
 *
 * These two documents are the ones we would be held to, so the fix was to make Settings true
 * rather than to quietly reword them. This test is what stops that gap reopening — either the
 * promise stays and Settings keeps the route, or somebody deliberately changes both.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

const TERMS = read('src/pages/TermsOfServicePage.tsx');
const REFUND = read('src/pages/RefundPolicyPage.tsx');
const SETTINGS = read('src/components/SettingsPage.tsx');

describe('cancelling from Settings', () => {
  it('is still what the terms and the refund policy promise', () => {
    expect(TERMS).toContain('cancel at any time from Settings');
    expect(REFUND).toContain('from the billing link in Settings');
  });

  it('is a route Settings actually offers', () => {
    // The prop, not the label: copy gets rewritten and this should survive that. What must not
    // disappear is Settings having somewhere to send them.
    expect(SETTINGS).toContain('onSubscription');
  });

  it('reaches the cancel button rather than the pricing table', () => {
    // goToPricing is the upsell, and sending somebody who wants to CANCEL to a page of plans to
    // buy is the specific dead end this whole change was about.
    const subscriptionScreen = read('src/components/account/SubscriptionContent.tsx');
    expect(subscriptionScreen).toContain('openBillingPortal');
    expect(subscriptionScreen).toContain('Manage billing or cancel');
  });
});
