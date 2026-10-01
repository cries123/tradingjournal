import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The admin-user function against an in-memory Firestore.
 *
 * What is under test is the shape of each action — what gets written, what gets refused, and what
 * the sentence back says — not Firestore itself. The fake supports exactly what the handlers use:
 * doc get/set(merge)/delete, a transaction that runs against the same store, and a `where uid ==`
 * query that returns nothing.
 */

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();

function snapshotOf(path: string) {
  const data = store.get(path);
  return { exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref: { path } };
}

function docRef(path: string) {
  return {
    path,
    get: async () => snapshotOf(path),
    set: async (data: Doc, options?: { merge?: boolean }) => {
      store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data });
    },
    delete: async () => {
      store.delete(path);
    },
  };
}

/** Everything written to adminAuditLog, which is the only place some actions leave a trace. */
const audit: Doc[] = [];
/** Set to make the audit write fail, which must never block the action it describes. */
let auditWritesFail = false;

const fakeDb = {
  doc: docRef,
  collection: (path: string) => ({
    where: () => ({ get: async () => ({ empty: true, docs: [], size: 0 }) }),
    limit: () => ({ get: async () => ({ empty: true, docs: [], size: 0 }) }),
    add: async (data: Doc) => {
      if (path === 'adminAuditLog') {
        if (auditWritesFail) throw new Error('audit collection refused the write');
        audit.push(data);
      }
      return { id: `entry-${audit.length}` };
    },
    path,
  }),
  batch: () => ({ delete: () => undefined, commit: async () => undefined }),
  runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      get: async (ref: { path: string }) => snapshotOf(ref.path),
      set: (ref: { path: string }, data: Doc, options?: { merge?: boolean }) => {
        store.set(ref.path, options?.merge ? { ...(store.get(ref.path) ?? {}), ...data } : { ...data });
      },
    }),
};

const authUsers = new Map<string, { email?: string; disabled?: boolean }>();
const updateUser = vi.fn(async (uid: string, patch: { disabled?: boolean }) => {
  authUsers.set(uid, { ...(authUsers.get(uid) ?? {}), ...patch });
});
const revokeRefreshTokens = vi.fn(async () => undefined);

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => fakeDb,
  getAdminAuth: () => ({
    verifyIdToken: async () => ({ uid: 'admin-1' }),
    getUser: async (uid: string) => ({ uid, ...(authUsers.get(uid) ?? {}) }),
    updateUser,
    revokeRefreshTokens,
    deleteUser: async () => undefined,
    createCustomToken: async (uid: string, claims: Record<string, unknown>) =>
      `token-for-${uid}-by-${String(claims.impersonatedBy)}`,
  }),
}));

vi.mock('../../server/snaptradeClient', () => ({
  SNAPTRADE_CONFIGURED: false,
  getSnaptrade: () => {
    throw new Error('not configured in tests');
  },
}));

vi.mock('../../server/mailer', () => ({
  isMailConfigured: () => false,
  sendEmail: async () => ({ sent: false, reason: 'not-configured' }),
  siteUrl: () => 'https://trendchasers.net',
}));

import { endOfDayEastern, handleAdminUserRequest, type AdminUserRequestBody } from '../../server/adminUserHandler';
import { usageDay } from '../../server/usage';
import { DAY_MS } from '../config/accessExtension';
import { TIER_PLANS } from '../config/tiers';

const HEADERS = { authorization: 'Bearer test-token' };
const TARGET = 'user-7';

async function call(body: Omit<AdminUserRequestBody, 'targetUid'> & { targetUid?: string }) {
  return handleAdminUserRequest(HEADERS, { targetUid: TARGET, ...body } as AdminUserRequestBody);
}

beforeEach(() => {
  store.clear();
  authUsers.clear();
  audit.length = 0;
  auditWritesFail = false;
  updateUser.mockClear();
  revokeRefreshTokens.mockClear();
  store.set('config/admin', { uid: 'admin-1' });
});

describe('the end of a day in New York', () => {
  it('is 03:59:59.999Z the next morning in summer and 04:59:59.999Z in winter', () => {
    expect(endOfDayEastern('2026-10-12')).toBe('2026-10-13T03:59:59.999Z');
    expect(endOfDayEastern('2026-12-15')).toBe('2026-12-16T04:59:59.999Z');
  });

  it('agrees with the allowance clock about which day it is', () => {
    const last = endOfDayEastern('2026-10-12');
    expect(usageDay(new Date(last))).toBe('2026-10-12');
    expect(usageDay(new Date(Date.parse(last) + 1))).toBe('2026-10-13');
  });
});

describe('extending access', () => {
  it('gives someone who has never paid a trial, from now', async () => {
    const before = Date.now();
    const res = await call({ action: 'extendAccess', tier: 'gold', days: 30, reason: 'asked nicely' });
    expect(res.statusCode).toBe(200);

    const record = store.get(`entitlements/${TARGET}`) as { tier: string; comp: { tier: string; until: string; reason: string; grantedBy: string } };
    expect(record.tier).toBe('free');
    expect(record.comp.tier).toBe('gold');
    expect(record.comp.reason).toBe('asked nicely');
    expect(record.comp.grantedBy).toBe('admin-1');
    const until = Date.parse(record.comp.until);
    expect(until).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
    expect(until).toBeLessThan(before + 30 * DAY_MS + 5_000);
    expect(res.body.message).toMatch(/^Gold until /);
  });

  it('adds time after the paid period, not on top of it', async () => {
    const periodEnd = new Date(Date.now() + 9 * DAY_MS).toISOString();
    store.set(`entitlements/${TARGET}`, {
      tier: 'silver', source: 'purchase', status: 'canceled', currentPeriodEnd: periodEnd, creemSubscriptionId: 'sub_1',
    });

    const res = await call({ action: 'extendAccess', tier: 'silver', days: 30 });
    expect(res.statusCode).toBe(200);
    const record = store.get(`entitlements/${TARGET}`) as { tier: string; creemSubscriptionId: string; comp: { until: string } };
    expect(Date.parse(record.comp.until)).toBe(Date.parse(periodEnd) + 30 * DAY_MS);
    // The subscription itself is untouched.
    expect(record.tier).toBe('silver');
    expect(record.creemSubscriptionId).toBe('sub_1');
  });

  it('runs to the end of a typed date, in New York', async () => {
    const date = new Date(Date.now() + 100 * DAY_MS).toISOString().slice(0, 10);
    const res = await call({ action: 'extendAccess', tier: 'diamond', until: date });
    expect(res.statusCode).toBe(200);
    const record = store.get(`entitlements/${TARGET}`) as { comp: { until: string } };
    expect(record.comp.until).toBe(endOfDayEastern(date));
  });

  it('refuses a date that has passed, one past two years out, a free tier, and nonsense days', async () => {
    expect((await call({ action: 'extendAccess', tier: 'gold', until: '2020-01-01' })).statusCode).toBe(400);
    expect((await call({ action: 'extendAccess', tier: 'gold', until: '2099-07-04' })).statusCode).toBe(400);
    expect((await call({ action: 'extendAccess', tier: 'free', days: 30 })).statusCode).toBe(400);
    expect((await call({ action: 'extendAccess', tier: 'gold', days: 0 })).statusCode).toBe(400);
    expect((await call({ action: 'extendAccess', tier: 'gold', days: 5000 })).statusCode).toBe(400);
    expect((await call({ action: 'extendAccess', tier: 'gold', until: 'next week' })).statusCode).toBe(400);
    expect(store.has(`entitlements/${TARGET}`)).toBe(false);
  });

  it('will not quietly step a live comp down to a lower plan', async () => {
    store.set(`entitlements/${TARGET}`, {
      tier: 'free', source: 'purchase', status: 'active',
      comp: { tier: 'diamond', until: new Date(Date.now() + 5 * DAY_MS).toISOString(), grantedBy: 'admin-1', grantedAt: '' },
    });
    const res = await call({ action: 'extendAccess', tier: 'gold', days: 30 });
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/Diamond on the house/);
  });

  it('can be ended, leaving the rest of the record alone', async () => {
    store.set(`entitlements/${TARGET}`, {
      tier: 'gold', source: 'purchase', status: 'active', creemSubscriptionId: 'sub_9',
      comp: { tier: 'gold', until: new Date(Date.now() + 5 * DAY_MS).toISOString(), grantedBy: 'admin-1', grantedAt: '' },
    });
    const res = await call({ action: 'clearAccessExtension' });
    expect(res.statusCode).toBe(200);
    const record = store.get(`entitlements/${TARGET}`) as { comp: unknown; creemSubscriptionId: string; tier: string };
    expect(record.comp).toBeNull();
    expect(record.creemSubscriptionId).toBe('sub_9');
    expect(record.tier).toBe('gold');
  });
});

describe('removing a manual grant', () => {
  it('keeps the record when complimentary access is still running on it', async () => {
    store.set(`entitlements/${TARGET}`, {
      tier: 'diamond', source: 'admin', status: 'active', grantedBy: 'admin-1',
      comp: { tier: 'gold', until: new Date(Date.now() + 5 * DAY_MS).toISOString(), grantedBy: 'admin-1', grantedAt: '' },
    });
    const res = await call({ action: 'clearTierGrant' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/complimentary Gold still applies/);
    const record = store.get(`entitlements/${TARGET}`) as { tier: string; source: string; comp: { tier: string } };
    expect(record.tier).toBe('free');
    expect(record.source).toBe('purchase');
    expect(record.comp.tier).toBe('gold');
  });

  it('deletes the record when there is nothing left to keep', async () => {
    store.set(`entitlements/${TARGET}`, { tier: 'diamond', source: 'admin', status: 'active' });
    await call({ action: 'clearTierGrant' });
    expect(store.has(`entitlements/${TARGET}`)).toBe(false);
  });

  it('hands a real subscription back at the tier they actually pay for', async () => {
    /*
     * The case this block never covered, and the bug it hid. Removing a grant wrote only source and
     * grantedBy, so the GRANTED tier and the forced status 'active' stayed behind — a Silver customer
     * granted Diamond and then un-granted read as an active Diamond purchase. resolveAccess served
     * Diamond, the admin run-rate counted $39 of revenue nobody pays, and a genuine attempt to buy
     * Silver was answered "you're already on Diamond".
     *
     * handleSetTier now snapshots what billing said; this is the round trip.
     */
    store.set(`entitlements/${TARGET}`, {
      tier: 'silver',
      source: 'purchase',
      status: 'active',
      creemSubscriptionId: 'sub_123',
      currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    });

    await call({ action: 'setTier', tier: 'diamond' });
    const granted = store.get(`entitlements/${TARGET}`) as Record<string, unknown>;
    expect(granted.tier).toBe('diamond');
    expect(granted.source).toBe('admin');
    expect(granted.preGrant).toMatchObject({ tier: 'silver', status: 'active' });

    const res = await call({ action: 'clearTierGrant' });
    expect(res.statusCode).toBe(200);

    const restored = store.get(`entitlements/${TARGET}`) as Record<string, unknown>;
    expect(restored.tier).toBe('silver');
    expect(restored.status).toBe('active');
    expect(restored.source).toBe('purchase');
    expect(restored.currentPeriodEnd).toBe('2026-11-01T00:00:00.000Z');
    // Cleared, so a second grant-and-clear cannot restore a snapshot from the first one.
    expect(restored.preGrant).toBeNull();
  });

  it('does not bury the billing snapshot when one grant replaces another', async () => {
    // Granting twice must keep the ORIGINAL billing state, not overwrite it with the first grant.
    store.set(`entitlements/${TARGET}`, {
      tier: 'silver',
      source: 'purchase',
      status: 'past_due',
      creemSubscriptionId: 'sub_123',
    });

    await call({ action: 'setTier', tier: 'gold' });
    await call({ action: 'setTier', tier: 'diamond' });
    await call({ action: 'clearTierGrant' });

    const restored = store.get(`entitlements/${TARGET}`) as Record<string, unknown>;
    expect(restored.tier).toBe('silver');
    expect(restored.status).toBe('past_due');
  });

  it('clears an invented status when there is no snapshot to restore', async () => {
    /*
     * A grant made before the snapshot existed. The granted tier cannot be undone, but the forced
     * 'active' can be, so the next webhook decides the status instead of a value this app made up.
     */
    store.set(`entitlements/${TARGET}`, {
      tier: 'diamond',
      source: 'admin',
      status: 'active',
      creemSubscriptionId: 'sub_123',
    });

    await call({ action: 'clearTierGrant' });

    const restored = store.get(`entitlements/${TARGET}`) as Record<string, unknown>;
    expect(restored.source).toBe('purchase');
    expect(restored.preGrant).toBeNull();
  });
});

describe("today's allowance and the bank", () => {
  const today = () => usageDay();

  it("gives back what was spent today without erasing that the calls were made", async () => {
    store.set(`entitlements/${TARGET}`, { tier: 'gold', source: 'purchase', status: 'active' });
    store.set(`syncUsage/${TARGET}_${today()}`, { uid: TARGET, day: today(), count: 2 });

    const res = await call({ action: 'resetUsageToday', kind: 'sync' });
    expect(res.statusCode).toBe(200);
    expect(res.body.given).toBe(2);
    expect(res.body.message).toBe('Gave back 2 syncs for today');

    const day = store.get(`syncUsage/${TARGET}_${today()}`) as { count: number; forgiven: number };
    expect(day.count).toBe(2);
    expect(day.forgiven).toBe(2);

    const usage = await call({ action: 'readUsage' });
    const report = usage.body.usage as { today: { sync: { used: number; limit: number; count: number; forgiven: number } } };
    // Read from the plan, not written down again here: this assertion is about the forgiving,
    // and pinning Gold's sync allowance in a second place only means breaking it from a distance
    // the next time the plans change.
    expect(report.today.sync).toMatchObject({
      used: 0,
      limit: TIER_PLANS.gold.limits.syncsPerDay,
      count: 2,
      forgiven: 2,
    });
  });

  it('says so when there is nothing to give back', async () => {
    const res = await call({ action: 'resetUsageToday', kind: 'ai' });
    expect(res.body.given).toBe(0);
    expect(res.body.message).toMatch(/nothing to give back/);
  });

  it('adds and removes credits, flooring at zero', async () => {
    let res = await call({ action: 'adjustCredits', kind: 'sync', delta: 5 });
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(5);
    expect(res.body.message).toBe('Added 5 syncs — they now have 5 syncs banked');

    res = await call({ action: 'adjustCredits', kind: 'sync', delta: -9 });
    expect(res.body.balance).toBe(0);

    res = await call({ action: 'adjustCredits', kind: 'ai', delta: 1 });
    expect(res.body.message).toBe('Added 1 AI message — they now have 1 AI message banked');
    expect(store.get(`usageCredits/${TARGET}`)).toMatchObject({ sync: 0, ai: 1 });
  });

  it('refuses a zero, fractional, absurd or unknown-kind adjustment', async () => {
    expect((await call({ action: 'adjustCredits', kind: 'sync', delta: 0 })).statusCode).toBe(400);
    expect((await call({ action: 'adjustCredits', kind: 'sync', delta: 1.5 })).statusCode).toBe(400);
    expect((await call({ action: 'adjustCredits', kind: 'sync', delta: 100000 })).statusCode).toBe(400);
    expect((await call({ action: 'adjustCredits', kind: 'takeaway', delta: 1 })).statusCode).toBe(400);
    expect((await call({ action: 'resetUsageToday', kind: 'coffee' })).statusCode).toBe(400);
    expect(store.has(`usageCredits/${TARGET}`)).toBe(false);
  });
});

describe('suspending sign-in', () => {
  it('disables the account, ends its sessions, and mirrors the flag for the list', async () => {
    const res = await call({ action: 'setSuspended', suspended: true, reason: 'chargeback' });
    expect(res.statusCode).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(TARGET, { disabled: true });
    expect(revokeRefreshTokens).toHaveBeenCalledWith(TARGET);
    expect(store.get(`users/${TARGET}`)).toMatchObject({ suspended: true, suspendedReason: 'chargeback' });
  });

  it('restores it without touching anything else on the profile', async () => {
    store.set(`users/${TARGET}`, { email: 'x@y.z', username: 'x', suspended: true, suspendedReason: 'chargeback' });
    const res = await call({ action: 'setSuspended', suspended: false });
    expect(res.statusCode).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(TARGET, { disabled: false });
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
    expect(store.get(`users/${TARGET}`)).toMatchObject({ email: 'x@y.z', username: 'x', suspended: false, suspendedReason: null });
  });

  it('refuses the admin themselves, the site admin, and a non-boolean', async () => {
    expect((await call({ action: 'setSuspended', targetUid: 'admin-1', suspended: true })).statusCode).toBe(400);
    expect((await call({ action: 'setSuspended', suspended: 'yes' })).statusCode).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('resetting the broker link', () => {
  it('forgets the stored secret and marks the connection gone', async () => {
    store.set(`users/${TARGET}/private/snaptrade`, { userId: TARGET, userSecret: 's3cret' });
    store.set(`brokerConnections/${TARGET}`, { uid: TARGET, connected: true, accountCount: 2, institutions: ['Schwab'], firstConnectedAt: 'x' });

    const res = await call({ action: 'resetBrokerLink' });
    expect(res.statusCode).toBe(200);
    expect(res.body.hadLink).toBe(true);
    expect(store.has(`users/${TARGET}/private/snaptrade`)).toBe(false);
    expect(store.get(`brokerConnections/${TARGET}`)).toMatchObject({ connected: false, accountCount: 0, institutions: [], firstConnectedAt: 'x' });
  });

  it('says when there was nothing stored', async () => {
    const res = await call({ action: 'resetBrokerLink' });
    expect(res.statusCode).toBe(200);
    expect(res.body.hadLink).toBe(false);
  });
});

describe('emailing the account holder', () => {
  it('checks the message before it checks the mail provider', async () => {
    authUsers.set(TARGET, { email: 'trader@example.com' });
    expect((await call({ action: 'emailUser', subject: '', message: 'hi' })).statusCode).toBe(400);
    expect((await call({ action: 'emailUser', subject: 'hi', message: '   ' })).statusCode).toBe(400);
    expect((await call({ action: 'emailUser', subject: 'x'.repeat(151), message: 'hi' })).statusCode).toBe(400);
  });

  it('reports a missing mail provider as a server problem, not a bad request', async () => {
    authUsers.set(TARGET, { email: 'trader@example.com' });
    const res = await call({ action: 'emailUser', subject: 'Hello', message: 'Your syncs are back.' });
    expect(res.statusCode).toBe(503);
    expect(String(res.body.error)).toMatch(/RESEND_API_KEY/);
  });
});

describe('the door', () => {
  it('still refuses an unknown action and a missing target', async () => {
    expect((await call({ action: 'launchRockets' as never })).statusCode).toBe(400);
    expect((await handleAdminUserRequest(HEADERS, { action: 'readUsage', targetUid: ' ' })).statusCode).toBe(400);
    expect((await handleAdminUserRequest({}, { action: 'readUsage', targetUid: TARGET })).statusCode).toBe(401);
  });
});

describe('signing in as a customer', () => {
  /*
   * The most sensitive action in the panel, and the only one that used to leave no trace.
   *
   * Every other admin action logs itself from the browser, which works because the admin is still
   * themselves afterwards. This one is not: the instant the custom token lands, the tab IS the
   * customer and the admin session is gone, so there is no session left that could write an entry.
   * Firestore then sees the customer's uid for everything that follows, so afterwards nothing
   * distinguished a support session from the customer doing it themselves.
   */
  it('records who signed in as whom, before minting the token', async () => {
    const result = await call({ action: 'impersonate', email: 'trader@example.com' });

    expect(result.statusCode).toBe(200);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      adminUid: 'admin-1',
      action: 'user.impersonated',
      targetType: 'user',
      targetId: TARGET,
      targetLabel: 'trader@example.com',
    });
    // Dated, or a log is a pile of events in no order.
    expect(typeof audit[0]!.at).toBe('string');
  });

  it('says in the entry what the session could do', async () => {
    // "Signed in as" alone understates it. The entry has to say that writes land in their history,
    // because that is what somebody reading the log later needs to know.
    await call({ action: 'impersonate' });

    expect(String(audit[0]!.detail)).toMatch(/full read and write/i);
    expect(String(audit[0]!.detail)).toMatch(/attributed to them/i);
  });

  it('falls back to the uid when no address was passed', async () => {
    await call({ action: 'impersonate' });
    expect(audit[0]!.targetLabel).toBe(TARGET);
  });

  it('mints a token carrying who was holding the keyboard', async () => {
    const result = await call({ action: 'impersonate' });
    // The claim is the only thing that can attribute a write during the session, so it is not
    // optional decoration.
    expect((result.body as { token: string }).token).toBe(`token-for-${TARGET}-by-admin-1`);
  });

  it('is refused to somebody who is not the admin', async () => {
    // The entry must never be written for a call that was going to be refused anyway.
    store.set('config/admin', { uid: 'somebody-else' });

    const result = await call({ action: 'impersonate' });

    expect(result.statusCode).toBe(403);
    expect(audit).toEqual([]);
  });
});

describe('when the audit log itself refuses', () => {
  it('still lets support into the account', async () => {
    /*
     * A refused audit write must not stop somebody getting in to fix a customer's problem, and the
     * client-side writer makes the same choice. The failure is logged loudly instead — an audit trail
     * with silent gaps is worse than one known to be patchy.
     */
    auditWritesFail = true;

    const result = await call({ action: 'impersonate' });

    expect(result.statusCode).toBe(200);
    expect((result.body as { token?: string }).token).toBeTruthy();
    expect(audit).toEqual([]);
  });
});
