import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';

/*
 * A first paint of the three account screens, against the states that actually differ.
 *
 * The interesting cases here are not the happy ones. A Google account has no password to
 * re-authenticate with, so the email and password forms cannot work at all and must not be drawn;
 * an account that has never paid has an empty ledger rather than a table; and somebody on a free
 * plan has no subscription to cancel, so the screen has to say that instead of offering a portal
 * link that would 404 on the server.
 */

const noop = () => {};

/*
 * renderToString writes an empty HTML comment between adjacent text nodes so it can hydrate them
 * apart again, which lands in the middle of every interpolated value: "you keep <!-- -->Gold".
 * Stripping them is the difference between asserting on the copy and asserting on React's
 * serialisation of it.
 */
const paint = (element: ReactElement): string =>
  renderToString(element).replaceAll('<!-- -->', '');

vi.mock('../../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));

vi.mock('../../services/account', () => ({
  fetchOrderHistory: async () => ({ entries: [], total: 0 }),
  renameUsername: async () => ({ username: 'newname', nextChangeAt: null }),
}));

const entitlement = {
  tier: 'gold' as const,
  /*
   * What the subscription is for, next to what it currently grants.
   *
   * These differ exactly when a payment has failed, which is the case the screen used to get wrong,
   * so they are separate fields here rather than one.
   */
  subscribedTier: 'gold' as const,
  /*
   * Whether there is a billing account to open, as the server reports it.
   *
   * The screen used to infer this from `tier !== 'free'`, which hid the portal from a past_due
   * customer on the same panel that asked them to update their card.
   */
  canManageBilling: true,
  status: 'active' as 'active' | 'canceled' | 'past_due' | 'expired',
  source: 'purchase' as const,
  currentPeriodEnd: '2026-10-01T00:00:00.000Z',
  complimentaryUntil: null,
  loaded: true,
};

const auth = {
  user: {
    uid: 'u1',
    email: 'trader@example.com',
    providerData: [{ providerId: 'password' }],
  },
  username: 'chelo618',
  loading: false,
  profileLoading: false,
  firebaseEnabled: true,
  changeEmail: async () => {},
  changePassword: async () => {},
  renameUsername: async () => 'newname',
  logout: async () => {},
};

vi.mock('../../context/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../context/useEntitlement', () => ({ useEntitlement: () => entitlement }));

const { AccountSettingsContent } = await import('./AccountSettingsContent');
const { SubscriptionContent } = await import('./SubscriptionContent');
const { OrderHistoryContent } = await import('./OrderHistoryContent');

describe('AccountSettingsContent', () => {
  it('offers all three changes to a password account', () => {
    const html = paint(createElement(AccountSettingsContent, { onBack: noop }));

    expect(html).toContain('Change username');
    expect(html).toContain('Send confirmation link');
    expect(html).toContain('Change password');
    expect(html).toContain('@chelo618');
    expect(html).toContain('trader@example.com');
  });

  it('names the cooldown rather than letting somebody find it by being refused', () => {
    expect(paint(createElement(AccountSettingsContent, { onBack: noop }))).toContain(
      'once every 30 days',
    );
  });

  it('sends a Google account to Google instead of drawing forms that cannot work', () => {
    const google = { ...auth, user: { ...auth.user, providerData: [{ providerId: 'google.com' }] } };
    const restore = auth.user;
    Object.assign(auth, google);

    const html = paint(createElement(AccountSettingsContent, { onBack: noop }));
    expect(html).toContain('myaccount.google.com');
    expect(html).not.toContain('Change password');
    // The username is ours, not Google's, so that form stays.
    expect(html).toContain('Change username');

    auth.user = restore;
  });
});

describe('SubscriptionContent', () => {
  it('shows the plan, the renewal date and the way out', () => {
    const html = paint(
      createElement(SubscriptionContent, { onBack: noop, onOrderHistory: noop }),
    );

    expect(html).toContain('Gold');
    expect(html).toContain('Manage billing or cancel');
    expect(html).toContain('Renews');
  });

  it('says a cancelled plan still runs to the end of the period', () => {
    // The single most common support question after somebody cancels, answered on the screen they
    // cancelled from.
    const restore = entitlement.status;
    entitlement.status = 'canceled' as typeof entitlement.status;

    const html = paint(
      createElement(SubscriptionContent, { onBack: noop, onOrderHistory: noop }),
    );
    expect(html).toContain('you keep Gold until');
    expect(html).toContain('will not be charged again');

    entitlement.status = restore;
  });

  it('offers plans rather than a cancel button to somebody on free', () => {
    const restoreTier = entitlement.tier;
    entitlement.tier = 'free' as typeof entitlement.tier;
    // No subscription, so the server reports no billing account either.
    entitlement.canManageBilling = false;

    const html = paint(
      createElement(SubscriptionContent, { onBack: noop, onOrderHistory: noop }),
    );
    expect(html).toContain('nothing to cancel');
    expect(html).not.toContain('Manage billing or cancel');
    expect(html).toContain('See plans');

    entitlement.tier = restoreTier;
    entitlement.canManageBilling = true;
  });

  it('tells an admin-granted plan there is no subscription behind it', () => {
    const restore = entitlement.source;
    entitlement.source = 'admin' as typeof entitlement.source;
    // creem-portal refuses an admin grant outright, so the server reports it as unmanageable and
    // the screen must not offer a button that would come back 409.
    entitlement.canManageBilling = false;

    const html = paint(
      createElement(SubscriptionContent, { onBack: noop, onOrderHistory: noop }),
    );
    expect(html).toContain('granted directly');
    expect(html).not.toContain('Manage billing or cancel');

    entitlement.source = restore;
    entitlement.canManageBilling = true;
  });

  it('gives a declined payment a way to fix itself', () => {
    /*
     * The bug. past_due drops the EFFECTIVE tier to free, and this screen gated the billing portal
     * on `tier !== 'free'` — so the customer whose card had just failed was told to update it on a
     * panel offering no way to, and their only route back was buying a second subscription.
     *
     * The same substitution made the message absurd: it named the effective plan, so it read
     * "update your card to keep Free".
     */
    entitlement.status = 'past_due';
    entitlement.tier = 'free' as typeof entitlement.tier;

    const html = paint(
      createElement(SubscriptionContent, { onBack: noop, onOrderHistory: noop }),
    );

    expect(html).toContain('Manage billing or cancel');
    expect(html).toContain('Gold features are paused');
    expect(html).not.toContain('keep Free');

    entitlement.status = 'active';
    entitlement.tier = 'gold';
  });
});

describe('AccountMenu', () => {
  it('shows the signed-in trigger, closed', async () => {
    const { AccountMenu } = await import('./AccountMenu');
    const html = paint(
      createElement(AccountMenu, {
        onAccount: noop,
        onSubscription: noop,
        onOrderHistory: noop,
      }),
    );

    expect(html).toContain('aria-expanded="false"');
    // Closed means closed: rendering the panel and hiding it would put the email address of the
    // signed-in user into the markup of every screen in the app.
    expect(html).not.toContain('Signed in as');
    expect(html).not.toContain('trader@example.com');
  });

  it('renders nothing at all with no account', async () => {
    const restore = auth.user;
    // @ts-expect-error -- deliberately the signed-out shape, which the component guards against.
    auth.user = null;

    const { AccountMenu } = await import('./AccountMenu');
    const html = paint(
      createElement(AccountMenu, {
        onAccount: noop,
        onSubscription: noop,
        onOrderHistory: noop,
      }),
    );
    expect(html).toBe('');

    auth.user = restore;
  });
});

describe('OrderHistoryContent', () => {
  it('paints before the fetch resolves rather than throwing on a null history', () => {
    // Effects do not run under renderToString, so this is the state the screen is in on first
    // paint every single time — and a table that reads history.entries straight away would throw.
    const html = paint(createElement(OrderHistoryContent, { onBack: noop }));
    expect(html).toContain('Loading');
  });
});
