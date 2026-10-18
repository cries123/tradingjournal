import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

/*
 * Support starting a conversation in a trader's Support inbox. What matters: the thread looks like
 * one the inbox already knows how to show (unread for them, last word from support), the address
 * comes from the account rather than the request, and a failed notice email never fails the send.
 */

const sent: { to: string; subject: string; text: string }[] = [];
let mailConfigured = true;
let mailThrows = false;

vi.mock('../../server/mailer', () => ({
  isMailConfigured: () => mailConfigured,
  siteUrl: () => 'https://trendchasers.net',
  sendEmail: async (mail: { to: string; subject: string; text: string }) => {
    if (mailThrows) throw new Error('provider down');
    sent.push(mail);
    return { sent: true };
  },
}));

const { openSupportThread } = await import('../../server/adminSupportMessage');

type Doc = Record<string, unknown>;
let store: Map<string, Doc>;
let nextId: number;

function ref(path: string) {
  return {
    id: path.split('/').pop()!,
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (data: Doc, opts?: { merge?: boolean }) => {
      store.set(path, opts?.merge ? { ...(store.get(path) ?? {}), ...data } : data);
    },
    collection: (sub: string) => collectionAt(`${path}/${sub}`),
  };
}

function collectionAt(path: string) {
  return { doc: (id?: string) => ref(`${path}/${id ?? `auto${nextId++}`}`) };
}

const db = {
  doc: (path: string) => ref(path),
  collection: (path: string) => collectionAt(path),
  batch: () => {
    const writes: [string, Doc][] = [];
    return {
      set: (r: { path: string }, data: Doc) => writes.push([r.path, data]),
      commit: async () => {
        for (const [path, data] of writes) store.set(path, data);
      },
    };
  },
} as unknown as Firestore;

const accounts = new Map<string, { email?: string }>();
const auth = {
  getUser: async (uid: string) => {
    const account = accounts.get(uid);
    if (!account) throw new Error('no user');
    return { uid, ...account };
  },
} as unknown as Auth;

const send = (over: Partial<{ subject: unknown; message: unknown; targetUid: string }> = {}) =>
  openSupportThread(
    { db, auth },
    { targetUid: 'trader-1', adminUid: 'admin-1', subject: 'About your Robinhood sync', message: 'Hi, we found the problem.', ...over },
  );

beforeEach(() => {
  store = new Map();
  nextId = 1;
  sent.length = 0;
  mailConfigured = true;
  mailThrows = false;
  accounts.clear();
  accounts.set('trader-1', { email: 'trader@example.com' });
  store.set('users/trader-1', { username: 'chelo618' });
});

describe('opening a support thread for a trader', () => {
  it('writes a ticket their inbox shows as unread, with support’s message first', async () => {
    const { ticketId } = await send();

    const ticket = store.get(`supportTickets/${ticketId}`)!;
    expect(ticket).toMatchObject({
      uid: 'trader-1',
      email: 'trader@example.com',
      username: 'chelo618',
      subject: 'About your Robinhood sync',
      status: 'open',
      lastMessageFrom: 'support',
      messageCount: 1,
      unreadForUser: true,
      unreadForSupport: false,
      openedBy: 'support',
    });

    const messages = [...store.entries()].filter(([path]) => path.startsWith(`supportTickets/${ticketId}/messages/`));
    expect(messages).toHaveLength(1);
    expect(messages[0]![1]).toMatchObject({
      from: 'support',
      authorUid: 'admin-1',
      authorName: 'Trend Chasers support',
      body: 'Hi, we found the problem.',
    });
  });

  it('emails a notice to the address on the account, worded as a new message rather than a reply', async () => {
    const { emailed } = await send();
    expect(emailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('trader@example.com');
    expect(sent[0]!.subject).toBe('About your Robinhood sync');
    expect(sent[0]!.text).toContain('support sent you a message');
    expect(sent[0]!.text).not.toContain('replied');
  });

  it('still sends to the inbox when the notice email fails or mail is not set up', async () => {
    mailThrows = true;
    const first = await send();
    expect(first.emailed).toBe(false);
    expect(store.has(`supportTickets/${first.ticketId}`)).toBe(true);

    mailThrows = false;
    mailConfigured = false;
    const second = await send();
    expect(second.emailed).toBe(false);
    expect(store.has(`supportTickets/${second.ticketId}`)).toBe(true);
  });

  it('refuses an empty or oversized message, and a missing account, before writing anything', async () => {
    await expect(send({ subject: 'Hi' })).rejects.toThrow(/subject/);
    await expect(send({ subject: 'x'.repeat(121) })).rejects.toThrow(/subject/);
    await expect(send({ message: '   ' })).rejects.toThrow(/message/);
    await expect(send({ message: 'x'.repeat(4001) })).rejects.toThrow(/message/);
    await expect(send({ subject: 42 })).rejects.toThrow(/subject/);
    await expect(send({ targetUid: 'nobody' })).rejects.toThrow(/no longer exists/);
    expect([...store.keys()].filter((p) => p.startsWith('supportTickets/'))).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
