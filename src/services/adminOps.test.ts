import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOBS, jobState, type JobRun } from '../utils/jobSchedule';

/*
 * The Ops records: job runs, the sync feed, the email log, the billing-event log, and the
 * admin-ops function that reads them back and replays a webhook. Against an in-memory Firestore
 * that supports exactly what these modules use.
 */

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();
let autoId = 0;

/** Everything under a collection path, as [path, data]. */
function listCollection(path: string): [string, Doc][] {
  const prefix = `${path}/`;
  return [...store.entries()].filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'));
}

function docRef(path: string) {
  return {
    id: path.split('/').pop()!,
    path,
    get: async () => ({ exists: store.has(path), id: path.split('/').pop()!, data: () => store.get(path) }),
    set: async (data: Doc, opts?: { merge?: boolean }) => {
      store.set(path, opts?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data });
    },
    create: async (data: Doc) => {
      if (store.has(path)) {
        const err = Object.assign(new Error('already exists'), { code: 6 });
        throw err;
      }
      store.set(path, { ...data });
    },
    delete: async () => {
      store.delete(path);
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function query(path: string) {
  let rows = listCollection(path);
  const q = {
    orderBy: (field: string, dir?: string) => {
      rows = [...rows].sort((a, b) => String(a[1][field]).localeCompare(String(b[1][field])) * (dir === 'desc' ? -1 : 1));
      return q;
    },
    where: (field: string, _op: string, value: unknown) => {
      rows = rows.filter(([, d]) => d[field] === value);
      return q;
    },
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return q;
    },
    offset: (n: number) => {
      rows = rows.slice(n);
      return q;
    },
    get: async () => ({
      empty: rows.length === 0,
      docs: rows.map(([p, d]) => ({ id: p.split('/').pop()!, ref: docRef(p), data: () => ({ ...d }) })),
    }),
  };
  return q;
}

function collectionRef(path: string) {
  return {
    ...query(path),
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
    add: async (data: Doc) => {
      const ref = docRef(`${path}/auto${++autoId}`);
      store.set(ref.path, { ...data });
      return ref;
    },
  };
}

const fakeDb = {
  doc: docRef,
  collection: collectionRef,
  batch: () => {
    const ops: (() => void)[] = [];
    return {
      set: (ref: { path: string }, data: Doc) => ops.push(() => store.set(ref.path, { ...data })),
      delete: (ref: { path: string }) => ops.push(() => store.delete(ref.path)),
      commit: async () => {
        for (const op of ops) op();
      },
    };
  },
};

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => fakeDb,
  getAdminAuth: () => ({
    verifyIdToken: async () => ({ uid: 'admin-1' }),
    getUser: async (uid: string) => ({ uid, email: `${uid}@example.com` }),
  }),
}));

const applied = vi.fn<(...args: unknown[]) => Promise<{ applied: boolean }>>(async () => ({ applied: true }));
vi.mock('../../server/creemApply', () => ({ applyCreemEvent: (...args: unknown[]) => applied(...args) }));
vi.mock('../../server/creemClient', () => ({
  parseBillingEvent: (payload: { object?: { metadata?: { uid?: string } } }) =>
    payload.object?.metadata?.uid
      ? { uid: payload.object.metadata.uid, tier: 'gold', status: 'active', trialing: false }
      : null,
  verifyWebhookSignature: () => true,
}));
vi.mock('../../server/mailer', () => ({ isMailConfigured: () => true }));

const { handleAdminOpsRequest } = await import('../../server/adminOpsHandler');
const { recordedJob, readLatestJobRuns } = await import('../../server/jobRuns');
const { logEmail, readEmailsTo } = await import('../../server/emailLog');
const { recordJournalEvent } = await import('../../server/journalEvents');

const HEADERS = { authorization: 'Bearer t' };
const call = (body: Record<string, unknown> = {}) => handleAdminOpsRequest(HEADERS, body);

beforeEach(() => {
  store.clear();
  autoId = 0;
  applied.mockClear();
  store.set('config/admin', { uid: 'admin-1' });
});

describe('a job’s state', () => {
  const spec = JOBS.find((j) => j.name === 'trial-nudges')!; // every 36 h
  const run = (over: Partial<JobRun>): JobRun => ({
    job: 'trial-nudges', startedAt: '2026-10-19T15:00:00Z', finishedAt: '2026-10-19T15:00:05Z', durationMs: 5000, ok: true, summary: null, error: null, ...over,
  });
  const T = Date.parse('2026-10-19T15:00:05Z');

  it('is never, ok, late or failed', () => {
    expect(jobState(spec, null, T)).toBe('never');
    expect(jobState(spec, run({}), T)).toBe('ok');
    expect(jobState(spec, run({}), T + 36 * 3_600_000)).toBe('ok');
    expect(jobState(spec, run({}), T + 36 * 3_600_000 + 1)).toBe('late');
    expect(jobState(spec, run({ ok: false }), T)).toBe('failed');
  });
});

describe('recording a scheduled run', () => {
  it('writes the latest run with the handler’s summary, and keeps a history', async () => {
    const wrapped = recordedJob('auto-sync', async () => ({ statusCode: 200, body: JSON.stringify({ ran: 3, imported: 12 }) }));
    const result = await wrapped({} as never, {} as never);
    expect(result).toMatchObject({ statusCode: 200 });

    const latest = store.get('jobRuns/auto-sync')!;
    expect(latest).toMatchObject({ job: 'auto-sync', ok: true, summary: { ran: 3, imported: 12 }, error: null });
    expect(listCollection('jobRuns/auto-sync/history')).toHaveLength(1);
  });

  it('records a 5xx answer as a failed run, with the status and what the body said', async () => {
    const wrapped = recordedJob('sync-health', async () => ({ statusCode: 500, body: 'sync-health failed' }));
    const result = await wrapped({} as never, {} as never);
    expect(result).toMatchObject({ statusCode: 500 });
    expect(store.get('jobRuns/sync-health')).toMatchObject({ ok: false, error: 'HTTP 500: sync-health failed', summary: null });
  });

  it('records a throw as a failed run and rethrows it', async () => {
    const wrapped = recordedJob('weekly-recap', async () => {
      throw new Error('mailbox full');
    });
    await expect(wrapped({} as never, {} as never)).rejects.toThrow('mailbox full');
    expect(store.get('jobRuns/weekly-recap')).toMatchObject({ ok: false, error: 'mailbox full' });
  });

  it('reads one slot per job, in the table’s order, null where a job has never run', async () => {
    await recordedJob('rule-alerts', async () => ({ statusCode: 200, body: '{}' }))({} as never, {} as never);
    const runs = await readLatestJobRuns();
    expect(runs).toHaveLength(JOBS.length);
    expect(runs[JOBS.findIndex((j) => j.name === 'rule-alerts')]?.job).toBe('rule-alerts');
    expect(runs[JOBS.findIndex((j) => j.name === 'auto-sync')]).toBeNull();
  });
});

describe('the email log', () => {
  it('lists one address’s sends newest first, without needing an ordered index', async () => {
    await logEmail({ to: 'a@x.com', subject: 'First', tag: 'trial', at: '2026-10-18T10:00:00Z', sent: true, reason: null, providerId: 'p1' });
    await logEmail({ to: 'b@x.com', subject: 'Other', tag: null, at: '2026-10-18T11:00:00Z', sent: true, reason: null, providerId: null });
    await logEmail({ to: 'a@x.com', subject: 'Second', tag: 'support-message', at: '2026-10-19T10:00:00Z', sent: false, reason: 'provider-error', providerId: null });
    const rows = await readEmailsTo('A@x.com ');
    expect(rows.map((r) => r.subject)).toEqual(['Second', 'First']);
  });
});

describe('the sync feed', () => {
  it('mirrors every sync row into one cross-user collection, pointing back at the user’s row', async () => {
    const id = await recordJournalEvent('u1', {
      type: 'sync', at: '2026-10-19T12:00:00Z',
      sync: { accountId: 'acc', institution: 'Schwab', activityCount: 10, tradesReturned: 4, unmatchedCloses: 0, ignored: 2, ignoredByType: {}, truncated: false },
    });
    await recordJournalEvent('u1', { type: 'clear', at: '2026-10-19T12:01:00Z', clear: { tradesRemoved: 3, journalId: 'j', journalName: null } });
    const feed = listCollection('syncFeed').map(([, d]) => d);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ uid: 'u1', eventId: id, sync: { institution: 'Schwab', tradesReturned: 4 } });
  });
});

describe('the admin-ops function', () => {
  it('refuses a caller with no token', async () => {
    expect((await handleAdminOpsRequest({}, {})).statusCode).toBe(401);
  });

  it('reads every record in one answer', async () => {
    store.set('jobRuns/sync-health', { job: 'sync-health', startedAt: 'a', finishedAt: '2026-10-19T13:00:00Z', durationMs: 10, ok: true, summary: null, error: null });
    store.set('syncFeed/s1', { uid: 'u1', at: '2026-10-19T11:00:00Z', sync: { accountId: 'a', institution: null, activityCount: 0, tradesReturned: 0, unmatchedCloses: 0, ignored: 0, ignoredByType: {}, truncated: false }, eventId: null });
    store.set('creemEvents/evt_1', { receivedAt: '2026-10-19T09:00:00Z', eventType: 'subscription.paid', uid: 'u1', outcome: 'applied', payload: '{"id":"evt_1"}' });
    store.set('emailLog/e1', { to: 'u1@x.com', subject: 'Hi', tag: null, at: '2026-10-19T08:00:00Z', sent: true, reason: null, providerId: null });

    const res = await call();
    expect(res.statusCode).toBe(200);
    const body = res.body as { jobs: { spec: { name: string }; last: unknown }[]; syncFeed: unknown[]; billingEvents: { payload: string | null }[]; emails: unknown[]; mailConfigured: boolean };
    expect(body.jobs).toHaveLength(JOBS.length);
    expect(body.jobs.find((j) => j.spec.name === 'sync-health')?.last).not.toBeNull();
    expect(body.syncFeed).toHaveLength(1);
    // The list says a payload is stored without carrying it.
    expect(body.billingEvents[0]?.payload).toBe('stored');
    expect(body.emails).toHaveLength(1);
    expect(body.mailConfigured).toBe(true);
  });

  it('replays a stored event through the plan logic without emailing, and audits it', async () => {
    store.set('creemEvents/evt_9', {
      receivedAt: '2026-10-19T09:00:00Z', eventType: 'subscription.paid', uid: 'u7', outcome: 'failed', replays: 0,
      payload: JSON.stringify({ id: 'evt_9', eventType: 'subscription.paid', object: { metadata: { uid: 'u7' } } }),
    });
    const res = await call({ action: 'replayWebhook', eventId: 'evt_9' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ applied: true });
    expect(applied).toHaveBeenCalledTimes(1);
    expect(applied.mock.calls[0]![3]).toEqual({ notify: false });
    expect(store.get('creemEvents/evt_9')).toMatchObject({ outcome: 'replayed', replays: 1 });
    const audit = listCollection('adminAuditLog').map(([, d]) => d);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'billing.event-replayed', targetId: 'evt_9', adminUid: 'admin-1' });
  });

  it('refuses a replay it cannot do: a bad id, an unknown event, one with no payload, one with nothing to apply', async () => {
    expect((await call({ action: 'replayWebhook', eventId: '../x' })).statusCode).toBe(400);
    expect((await call({ action: 'replayWebhook', eventId: 'nope' })).statusCode).toBe(404);
    store.set('creemEvents/old', { receivedAt: '2026-01-01T00:00:00Z' });
    expect((await call({ action: 'replayWebhook', eventId: 'old' })).statusCode).toBe(409);
    store.set('creemEvents/nouid', { receivedAt: '2026-01-01T00:00:00Z', payload: '{"id":"nouid","object":{}}' });
    expect((await call({ action: 'replayWebhook', eventId: 'nouid' })).statusCode).toBe(409);
    expect(applied).not.toHaveBeenCalled();
  });

  it('lists one user’s emails on request', async () => {
    store.set('emailLog/e1', { to: 'u1@x.com', subject: 'Hi', tag: null, at: '2026-10-19T08:00:00Z', sent: true, reason: null, providerId: null });
    expect((await call({ action: 'userEmails' })).statusCode).toBe(400);
    const res = await call({ action: 'userEmails', email: 'u1@x.com' });
    expect((res.body as { emails: unknown[] }).emails).toHaveLength(1);
  });
});
