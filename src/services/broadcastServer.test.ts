import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The email to everybody, driven through the real handler with Firestore, Auth and Resend faked.
 *
 * What has to hold: the people who unsubscribed from news never get news, a notice still reaches
 * them, nothing is sent without a postal address and an unsubscribe link, every chunk is one batch
 * with a key of its own, and a send that is interrupted at any point finishes without sending
 * anybody a second copy. No real key is used anywhere in this file.
 */

type Data = Record<string, unknown>;
const store = new Map<string, Data>();
let autoId = 0;

function docRef(path: string) {
  return {
    path,
    id: path.split('/').pop()!,
    get: async () => ({ exists: store.has(path), id: path.split('/').pop()!, data: () => store.get(path) }),
    set: async (data: Data, options?: { merge?: boolean }) => {
      store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data });
    },
    update: async (data: Data) => {
      if (!store.has(path)) throw new Error(`no document at ${path}`);
      store.set(path, { ...store.get(path)!, ...data });
    },
  };
}

function query(path: string, filters: [string, unknown][] = [], order: [string, 'asc' | 'desc'] | null = null, max = Infinity) {
  return {
    where: (field: string, _op: '==', value: unknown) => query(path, [...filters, [field, value]], order, max),
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => query(path, filters, [field, dir], max),
    limit: (n: number) => query(path, filters, order, n),
    get: async () => {
      let docs = [...store.keys()]
        .filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .sort()
        .map((key) => ({ id: key.slice(path.length + 1), ref: docRef(key), data: () => store.get(key)! }))
        .filter((d) => filters.every(([f, v]) => d.data()[f] === v));
      if (order) {
        const [f, dir] = order;
        docs = docs.sort((a, b) => String(a.data()[f]).localeCompare(String(b.data()[f])) * (dir === 'desc' ? -1 : 1));
      }
      docs = docs.slice(0, max);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  };
}

function collection(path: string) {
  return {
    ...query(path),
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
    add: async (data: Data) => {
      store.set(`${path}/auto${++autoId}`, { ...data });
    },
  };
}

const db = {
  collection,
  doc: docRef,
  batch: () => {
    const writes: [ReturnType<typeof docRef>, Data][] = [];
    return {
      set: (ref: ReturnType<typeof docRef>, data: Data) => writes.push([ref, data]),
      commit: async () => {
        for (const [ref, data] of writes) await ref.set(data);
      },
    };
  },
  runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      get: (ref: ReturnType<typeof docRef>) => ref.get(),
      update: (ref: ReturnType<typeof docRef>, data: Data) => {
        store.set(ref.path, { ...store.get(ref.path)!, ...data });
      },
    }),
};

let accounts: { uid: string; email?: string; disabled?: boolean }[] = [];

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => db,
  getAdminAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token === 'admin-token' ? 'admin-uid' : 'someone' }),
    getUser: async (uid: string) => ({ uid, email: uid === 'admin-uid' ? 'owner@example.com' : `${uid}@example.com` }),
    // Pages of two, so the paging loop is exercised on a short list.
    listUsers: async (_max: number, token?: string) => {
      const from = token ? Number(token) : 0;
      const users = accounts.slice(from, from + 2);
      return { users, pageToken: from + 2 < accounts.length ? String(from + 2) : undefined };
    },
  }),
}));
vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));

interface Call {
  url: string;
  key: string | null;
  body: Data | Data[];
}
let calls: Call[] = [];
let respond: (call: Call) => Response | Promise<Response> = (call) =>
  new Response(JSON.stringify(Array.isArray(call.body) ? { data: call.body.map((_, i) => ({ id: `m${i}` })) } : { id: 'single' }), { status: 200 });

const { handleAdminBroadcastRequest } = await import('../../server/adminBroadcastHandler');
const { CHUNK_SIZE, MAX_STRIKES } = await import('../../server/broadcast');

const ADMIN = { authorization: 'Bearer admin-token' };
const later = () => Date.now() + 60_000;
const call = (body: Data, headers: Record<string, string> = ADMIN, deadline = later()) =>
  handleAdminBroadcastRequest(headers, body, deadline);

const NEWS = {
  kind: 'news',
  audience: 'all',
  subject: 'Market replay is here',
  body: 'Replay any day you traded.\n\nSee https://trendchasers.net/market-replay',
};

const people = (n: number, prefix = 'u') => Array.from({ length: n }, (_, i) => ({ uid: `${prefix}${i}`, email: `${prefix}${i}@example.com` }));
const chunks = (id: string) => [...store.entries()].filter(([k]) => k.startsWith(`broadcasts/${id}/chunks/`)).map(([, v]) => v);
const batches = () => calls.filter((c) => c.url.endsWith('/emails/batch'));
const allRecipients = () =>
  calls.flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]).map((m) => (m.to as string[])[0]));

async function createAndSend(body: Data = NEWS) {
  const created = await call({ action: 'create', ...body });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(200);
  const id = (created.body.broadcast as { id: string }).id;
  const sent = await call({ action: 'send', id });
  return { id, created, sent };
}

beforeEach(() => {
  store.clear();
  store.set('config/admin', { uid: 'admin-uid' });
  accounts = people(5);
  calls = [];
  respond = (c) =>
    new Response(JSON.stringify(Array.isArray(c.body) ? { data: c.body.map((_, i) => ({ id: `m${i}` })) } : { id: 'single' }), { status: 200 });
  vi.stubEnv('RESEND_API_KEY', 're_test_not_a_real_key');
  vi.stubEnv('EMAIL_TOKEN_SECRET', 'a-test-secret-long-enough');
  vi.stubEnv('MAIL_POSTAL_ADDRESS', 'PO Box 123, Austin, TX 78701');
  vi.stubEnv('SITE_URL', 'https://trendchasers.net');
  vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const c: Call = { url, key: init.headers['Idempotency-Key'] ?? null, body: JSON.parse(init.body) };
    calls.push(c);
    return respond(c);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('who may use it', () => {
  it('is the site admin’s alone', async () => {
    const res = await call({ action: 'status' }, { authorization: 'Bearer someone-else' });
    expect(res.statusCode).toBe(403);
    expect((await call({ action: 'create', ...NEWS }, {})).statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe('who it goes to', () => {
  it('leaves out people who unsubscribed from news, and says how many', async () => {
    store.set('emailPrefs/u1', { uid: 'u1', news: false });
    store.set('emailPrefs/u2', { uid: 'u2', recap: false }); // a different list: still gets news
    const res = await call({ action: 'count', audience: 'all', kind: 'news' });
    expect(res.body.counts).toMatchObject({ recipients: 4, optedOut: 1 });

    await createAndSend();
    expect(allRecipients()).not.toContain('u1@example.com');
    expect(allRecipients()).toContain('u2@example.com');
  });

  it('still reaches them with an account notice, which they cannot opt out of', async () => {
    store.set('emailPrefs/u1', { uid: 'u1', news: false });
    await createAndSend({ ...NEWS, kind: 'notice', noticeConfirmed: true });
    expect(allRecipients()).toContain('u1@example.com');
  });

  it('reads the plan the way every gate does, so a lapsed subscription is not paid', async () => {
    store.set('entitlements/u0', { tier: 'gold', status: 'active', source: 'purchase', updatedAt: '' });
    store.set('entitlements/u1', { tier: 'gold', status: 'canceled', currentPeriodEnd: '2020-01-01T00:00:00Z', source: 'purchase', updatedAt: '' });
    store.set('entitlements/u2', { tier: 'diamond', status: 'active', source: 'purchase', updatedAt: '' });
    const gold = await call({ action: 'count', audience: 'gold', kind: 'news' });
    expect(gold.body.counts).toMatchObject({ recipients: 1, otherPlans: 4 });
    const paid = await call({ action: 'count', audience: 'paid', kind: 'news' });
    expect(paid.body.counts).toMatchObject({ recipients: 2 });
  });

  it('skips suspended accounts and accounts with no usable address, and sends a shared address once', async () => {
    accounts = [
      { uid: 'a', email: 'same@example.com' },
      { uid: 'b', email: 'SAME@example.com' },
      { uid: 'c', email: 'not-an-address' },
      { uid: 'd' },
      { uid: 'e', email: 'e@example.com', disabled: true },
    ];
    const res = await call({ action: 'count', audience: 'all', kind: 'news' });
    expect(res.body.counts).toEqual({ recipients: 1, optedOut: 0, noEmail: 2, disabled: 1, otherPlans: 0, duplicates: 1 });
  });
});

describe('what it refuses to send', () => {
  it('will not send news without a postal address, and names the setting', async () => {
    vi.stubEnv('MAIL_POSTAL_ADDRESS', '');
    const res = await call({ action: 'create', ...NEWS });
    expect(res.statusCode).toBe(503);
    expect(String(res.body.error)).toContain('MAIL_POSTAL_ADDRESS');
    expect([...store.keys()].some((k) => k.startsWith('broadcasts/'))).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('will not send news with no way to unsubscribe', async () => {
    vi.stubEnv('EMAIL_TOKEN_SECRET', '');
    const res = await call({ action: 'create', ...NEWS });
    expect(res.statusCode).toBe(503);
    expect(String(res.body.error)).toContain('EMAIL_TOKEN_SECRET');
  });

  it('sends a notice without either, once the admin says it is one', async () => {
    vi.stubEnv('MAIL_POSTAL_ADDRESS', '');
    const unticked = await call({ action: 'create', ...NEWS, kind: 'notice' });
    expect(unticked.statusCode).toBe(400);
    expect((await call({ action: 'create', ...NEWS, kind: 'notice', noticeConfirmed: true })).statusCode).toBe(200);
  });
});

describe('what each person gets', () => {
  it('puts an unsubscribe link, the one-click headers and the postal address in news', async () => {
    accounts = people(1);
    await createAndSend();
    const [message] = batches()[0].body as Data[];
    expect(message.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(String((message.headers as Data)['List-Unsubscribe'])).toMatch(/^<https:\/\/trendchasers\.net\/api\/email-unsubscribe\?uid=u0&t=[0-9a-f]+&p=news>$/);
    expect(String(message.html)).toContain('p=news');
    expect(String(message.html)).toContain('PO Box 123, Austin, TX 78701');
    expect(message.reply_to).toBe('support@trendchasers.net');
  });

  it('gives a notice no unsubscribe link and no List-Unsubscribe header', async () => {
    accounts = people(1);
    await createAndSend({ ...NEWS, kind: 'notice', noticeConfirmed: true });
    const [message] = batches()[0].body as Data[];
    expect(message.headers).toBeUndefined();
    expect(String(message.html)).not.toContain('email-unsubscribe');
  });
});

describe('sending', () => {
  it('sends each hundred people as one batch with its own key, and finishes', async () => {
    accounts = people(CHUNK_SIZE * 2 + 50);
    const { id, created, sent } = await createAndSend();
    expect(created.body.broadcast).toMatchObject({ total: 250, chunkCount: 3, status: 'sending' });
    expect(batches().map((c) => c.key)).toEqual([`broadcast-${id}-0000`, `broadcast-${id}-0001`, `broadcast-${id}-0002`]);
    expect(batches().map((c) => (c.body as Data[]).length)).toEqual([100, 100, 50]);
    expect(sent.body.broadcast).toMatchObject({ status: 'done', sent: 250, failed: 0, remaining: 0 });
    // Every recipient is in the email log, as for every other send.
    expect([...store.keys()].filter((k) => k.startsWith('emailLog/'))).toHaveLength(250);
  });

  it('starts no chunk without time to finish it', async () => {
    const created = await call({ action: 'create', ...NEWS });
    const id = (created.body.broadcast as { id: string }).id;
    const res = await call({ action: 'send', id }, ADMIN, Date.now());
    expect(res.body.broadcast).toMatchObject({ status: 'sending', sent: 0 });
    expect(calls).toHaveLength(0);
  });

  it('retries a chunk the provider turned away with the same key, so nobody gets two', async () => {
    let first = true;
    respond = (c) => {
      if (first) {
        first = false;
        return new Response('slow down', { status: 429 });
      }
      return new Response(JSON.stringify({ data: (c.body as Data[]).map(() => ({ id: 'x' })) }), { status: 200 });
    };
    const { id, sent } = await createAndSend();
    expect(sent.body).toMatchObject({ waiting: true });
    expect(sent.body.broadcast).toMatchObject({ status: 'sending', sent: 0 });

    const again = await call({ action: 'send', id });
    expect(again.body.broadcast).toMatchObject({ status: 'done', sent: 5 });
    expect(batches().map((c) => c.key)).toEqual([`broadcast-${id}-0000`, `broadcast-${id}-0000`]);
  });

  it('picks up a chunk whose call died holding it, and leaves one still being sent alone', async () => {
    accounts = people(CHUNK_SIZE + 1);
    const created = await call({ action: 'create', ...NEWS });
    const id = (created.body.broadcast as { id: string }).id;
    store.set(`broadcasts/${id}/chunks/0000`, { ...store.get(`broadcasts/${id}/chunks/0000`)!, status: 'sending', leaseUntil: '2020-01-01T00:00:00.000Z' });
    store.set(`broadcasts/${id}/chunks/0001`, { ...store.get(`broadcasts/${id}/chunks/0001`)!, status: 'sending', leaseUntil: '2999-01-01T00:00:00.000Z' });

    const res = await call({ action: 'send', id });
    expect(batches().map((c) => c.key)).toEqual([`broadcast-${id}-0000`]);
    expect(chunks(id)[0]).toMatchObject({ status: 'sent', strikes: 1 });
    expect(res.body.broadcast).toMatchObject({ status: 'sending', sent: 100 });
  });

  it('sends one at a time when a batch is refused outright, so one bad address costs one email', async () => {
    accounts = people(3);
    respond = (c) => {
      if (Array.isArray(c.body)) return new Response('{"message":"invalid to"}', { status: 422 });
      const to = (c.body.to as string[])[0];
      return to === 'u1@example.com' ? new Response('{"message":"invalid to"}', { status: 422 }) : new Response('{"id":"one"}', { status: 200 });
    };
    const { id, sent } = await createAndSend();
    const singles = calls.filter((c) => c.url.endsWith('/emails'));
    expect(singles.map((c) => c.key)).toEqual([`broadcast-${id}-0000-0`, `broadcast-${id}-0000-1`, `broadcast-${id}-0000-2`]);
    expect(sent.body.broadcast).toMatchObject({ status: 'done', sent: 2, failed: 1 });
  });

  it('gives up on a chunk after repeated outages and says how many failed', async () => {
    respond = () => new Response('down', { status: 503 });
    const { id } = await createAndSend();
    let last: Data = {};
    for (let i = 0; i < MAX_STRIKES; i++) last = (await call({ action: 'send', id })).body;
    expect(last.broadcast).toMatchObject({ status: 'done', sent: 0, failed: 5 });
    expect(batches()).toHaveLength(MAX_STRIKES);
    // Each person it never reached has a "not sent" row, so their card can say so.
    const log = [...store.entries()].filter(([k]) => k.startsWith('emailLog/')).map(([, v]) => v);
    expect(log.filter((row) => row.sent === false && row.tag === 'broadcast')).toHaveLength(5);
  });

  it('records who started it in the audit log', async () => {
    await createAndSend();
    const audit = [...store.entries()].filter(([k]) => k.startsWith('adminAuditLog/')).map(([, v]) => v);
    expect(audit).toEqual([expect.objectContaining({ action: 'email.broadcast-sent', adminUid: 'admin-uid', targetType: 'broadcast' })]);
  });
});

describe('testing before sending', () => {
  it('sends the admin one copy, marked as a test, and records it', async () => {
    const res = await call({ action: 'test', ...NEWS });
    expect(res.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect((calls[0].body as Data).subject).toBe('[Test] Market replay is here');
    expect((calls[0].body as Data).to).toEqual(['owner@example.com']);
    expect([...store.keys()].some((k) => k.startsWith('broadcasts/'))).toBe(false);
  });

  it('previews the real template without sending anything', async () => {
    const res = await call({ action: 'preview', ...NEWS });
    expect(String(res.body.html)).toContain('Market replay is here');
    expect(calls).toHaveLength(0);
  });
});
