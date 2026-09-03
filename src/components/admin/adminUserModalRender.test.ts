import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

/*
 * A first paint of each new admin section, with nothing mocked but the network.
 *
 * Not a visual test — there is no browser here — but renderToString runs every line of render
 * code with real props, which is where an undefined `usage.today[kind]` or a wrong prop name
 * would throw. Effects do not run, so nothing is fetched.
 */

vi.mock('../../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));

import { AdminUserUsageSection } from './AdminUserUsageSection';
import { AdminUserPlanSection } from './AdminUserPlanSection';
import { AdminUserEmailComposer } from './AdminUserEmailComposer';
import { AdminUserHistorySection } from './AdminUserHistorySection';
import { AdminUserDetailModal } from './AdminUserDetailModal';
import { AUDIT_ACTION_LABELS } from '../../services/adminAuditLog';
import type { AdminUserSummary } from '../../services/admin';

const noop = () => undefined;
const asyncNoop = async () => undefined;

/** Server rendering separates adjacent text with comment nodes; the eye does not. */
const paint = (element: Parameters<typeof renderToString>[0]) => renderToString(element).replace(/<!-- -->/g, '');

const usage = {
  syncs: { total: 12, last30: 4, lastDay: '2026-09-01' },
  ai: { total: 3, last30: 3, lastDay: '2026-08-30' },
  takeaways: { total: 0, last30: 0, lastDay: null },
  today: {
    sync: { used: 1, limit: 1, count: 3, forgiven: 2, bonus: 0 },
    ai: { used: 0, limit: 0, count: 0, forgiven: 0, bonus: 0 },
  },
  credits: { sync: 3, ai: 0 },
  tier: 'silver' as const,
};

const user: AdminUserSummary = {
  uid: 'u1',
  email: 'trader@example.com',
  username: 'chelo618',
  lastLoginAt: '2026-09-02T10:00:00.000Z',
  createdAt: '2026-06-01T10:00:00.000Z',
  tradeCount: 40,
  lastTradeDate: '2026-09-01',
  lastTradeActivityAt: '2026-09-01T20:00:00.000Z',
  firstTradeDate: '2026-06-12',
  totalPnl: -1703.1,
  winRate: 41,
  tradesSavedLast7Days: 3,
  tradesSessionLast7Days: 3,
  coachShareEnabled: false,
  suspended: true,
};

describe('the new admin sections render', () => {
  it("shows today's meter, the bank, and why AI credits are off for Silver", () => {
    const html = paint(
      createElement(AdminUserUsageSection, { uid: 'u1', usage, onChanged: asyncNoop, onDone: noop, onError: noop, onAudit: noop }),
    );
    expect(html).toContain('1 of 1');
    expect(html).toContain('2 given back');
    expect(html).toContain('Not in Silver');
    expect(html).toContain('banked');
  });

  it('offers every paid plan and every preset for an extension', () => {
    const html = paint(
      createElement(AdminUserPlanSection, { uid: 'u1', onDone: noop, onError: noop, onAudit: noop }),
    );
    expect(html).toContain('Extend access');
    expect(html).toContain('+30 days');
    expect(html).toContain('Diamond');
    expect(html).toContain('Checking…');
  });

  it('collapses the composer to one button until it is wanted', () => {
    const html = paint(
      createElement(AdminUserEmailComposer, {
        uid: 'u1', email: 'trader@example.com', displayName: '@chelo618', onDone: noop, onError: noop, onAudit: noop,
      }),
    );
    expect(html).toContain('Email this user');
    expect(html).not.toContain('Subject');
  });

  it('lists tickets and bug reports with their status', () => {
    const html = paint(
      createElement(AdminUserHistorySection, {
        uid: 'u1',
        tickets: [{ id: 't1', subject: 'Sync ate my day', status: 'open', createdAt: '2026-09-01T00:00:00Z' } as never],
        reports: [{ id: 'b1', description: 'Calendar shows the wrong month total', status: 'resolved', createdAt: '2026-08-01T00:00:00Z' } as never],
        actionLabels: AUDIT_ACTION_LABELS,
        version: 0,
      }),
    );
    expect(html).toContain('Sync ate my day');
    expect(html).toContain('wrong month total');
    expect(html).toContain('Loading admin actions');
  });

  it('paints the whole modal for a suspended user, with the restore button and no suspend button', () => {
    const html = paint(
      createElement(AdminUserDetailModal, {
        user,
        adminUid: 'admin-1',
        adminEmail: 'jay@example.com',
        note: { note: '', flagged: false, updatedAt: null, updatedBy: null },
        tickets: [],
        reports: [],
        onNoteSave: async () => ({ note: '', flagged: false, updatedAt: null, updatedBy: null }),
        onClose: noop,
        onUserUpdated: noop,
        onUserDeleted: noop,
      }),
    );
    expect(html).toContain('Suspended');
    expect(html).toContain('Restore sign-in');
    expect(html).not.toContain('Suspend sign-in');
    expect(html).toContain('Reset broker link');
    expect(html).toContain('Email this user');
    expect(html).toContain('History');
  });
});
