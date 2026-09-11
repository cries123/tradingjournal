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
  status: 'active' as const,
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

    const html = paint(
      createElement(SubscriptionContent, { onBack: noop, onOrderHistory: noop }),
    );
    expect(html).toContain('nothing to cancel');
    expect(html).not.toContain('Manage billing or cancel');
    expect(html).toContain('See plans');

    entitlement.tier = restoreTier;
  });

  it('tells an admin-granted plan there is no subscription behind it', () => {
    const restore = entitlement.source;
    entitlement.source = 'admin' as typeof entitlement.source;

    const html = paint(
      createElement(SubscriptionContent, { onBack: noop, onOrderHistory: noop }),
    );
    expect(html).toContain('granted directly');
    expect(html).not.toContain('Manage billing or cancel');

    entitlement.source = restore;
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
