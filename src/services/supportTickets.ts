import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import type { AdminPriority } from './adminShared';

/**
 * Support tickets: a conversation, not a form submission.
 *
 * The bug-report form already here is one-directional — someone describes a problem, it lands in
 * the admin panel, and the only way back to them is email, which means the reply arrives outside
 * the product with none of its context. That is survivable for "this button looks wrong". It is not
 * survivable for "I paid and didn't get my plan", where the person is anxious, the answer needs
 * two or three exchanges, and every one of those exchanges is a chance to lose them.
 *
 * So a ticket is a document with a messages subcollection, and both sides append to it. The
 * summary fields on the parent — who spoke last, whether the other side has read it — are what let
 * the ticket list say "waiting on you" without opening every thread.
 */

export const TICKET_COLLECTION = 'supportTickets';

export type TicketStatus = 'open' | 'resolved' | 'closed';
export type TicketAuthor = 'user' | 'support';

/**
 * Why they are writing in.
 *
 * Kept short deliberately. A category list long enough to be precise is long enough that people
 * pick wrong, and the two that matter — money took, plan missing — are worth their own rows
 * because they are the ones that need answering within the hour.
 */
export type TicketCategory = 'billing' | 'membership' | 'broker' | 'bug' | 'account' | 'other';

export const TICKET_CATEGORIES: { id: TicketCategory; label: string; blurb: string }[] = [
  { id: 'billing', label: 'Payment problem', blurb: 'A charge failed, went through twice, or you need a refund.' },
  { id: 'membership', label: 'Missing membership', blurb: 'You paid but your plan still shows the old tier.' },
  { id: 'broker', label: 'Broker connection', blurb: 'Connecting, syncing or disconnecting a brokerage.' },
  { id: 'bug', label: 'Something is broken', blurb: 'A page, number or button that is not behaving.' },
  { id: 'account', label: 'Account access', blurb: 'Sign-in, email, username or deleting your account.' },
  { id: 'other', label: 'Something else', blurb: "Anything that doesn't fit the rest." },
];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = TICKET_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c.label }),
  {} as Record<TicketCategory, string>,
);

export interface SupportTicket {
  id: string;
  uid: string;
  email: string;
  username: string | null;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority?: AdminPriority;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessageFrom: TicketAuthor;
  lastMessagePreview: string;
  messageCount: number;
  /** Support has replied and the user hasn't opened it since. */
  unreadForUser: boolean;
  /** The user has written and nobody has answered yet. */
  unreadForSupport: boolean;
  adminNote?: string;
  /** Plan at the moment the ticket was opened — the first thing a billing question needs. */
  plan?: string;
  pageUrl?: string;
  userAgent?: string;
}

export interface TicketMessage {
  id: string;
  from: TicketAuthor;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CreateTicketInput {
  uid: string;
  email: string;
  username: string | null;
  subject: string;
  category: TicketCategory;
  body: string;
  plan?: string;
}

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_SUBJECT_LENGTH = 120;

function preview(body: string): string {
  return body.trim().replace(/\s+/g, ' ').slice(0, 140);
}

function assertConfigured(): void {
  if (!isFirebaseConfigured()) {
    throw new Error('Support is unavailable right now. Please email support@trendchasers.net instead.');
  }
}

/**
 * Open a ticket and post its first message.
 *
 * One batch, so a ticket can never exist with nothing in it — an empty thread in the support queue
 * is indistinguishable from a bug, and somebody would spend time on it.
 */
export async function createSupportTicket(input: CreateTicketInput): Promise<string> {
  assertConfigured();

  const db = getFirebaseDb();
  const now = new Date().toISOString();
  const body = input.body.trim().slice(0, MAX_MESSAGE_LENGTH);
  const ticketRef = doc(collection(db, TICKET_COLLECTION));
  const messageRef = doc(collection(db, TICKET_COLLECTION, ticketRef.id, 'messages'));

  const batch = writeBatch(db);

  batch.set(ticketRef, {
    uid: input.uid,
    email: input.email.trim(),
    username: input.username ?? null,
    subject: input.subject.trim().slice(0, MAX_SUBJECT_LENGTH),
    category: input.category,
    status: 'open' as TicketStatus,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastMessageFrom: 'user' as TicketAuthor,
    lastMessagePreview: preview(body),
    messageCount: 1,
    unreadForUser: false,
    unreadForSupport: true,
    plan: input.plan ?? null,
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
  });

  batch.set(messageRef, {
    from: 'user' as TicketAuthor,
    authorUid: input.uid,
    authorName: input.username ?? input.email,
    body,
    createdAt: now,
  });

  await batch.commit();
  return ticketRef.id;
}

/**
 * Append to a thread.
 *
 * The parent's summary fields are rewritten in the same batch rather than derived on read, because
 * the ticket list has to sort by activity and show who is waiting without opening every
 * subcollection — which would be one query per row.
 *
 * A reply also reopens a resolved ticket. Someone writing back after being told their problem was
 * fixed is the clearest possible signal that it was not.
 */
export async function postTicketMessage(
  ticket: Pick<SupportTicket, 'id' | 'messageCount' | 'status'>,
  from: TicketAuthor,
  body: string,
  author: { uid: string; name: string },
): Promise<void> {
  assertConfigured();

  const db = getFirebaseDb();
  const now = new Date().toISOString();
  const trimmed = body.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) return;

  const ticketRef = doc(db, TICKET_COLLECTION, ticket.id);
  const messageRef = doc(collection(db, TICKET_COLLECTION, ticket.id, 'messages'));

  const batch = writeBatch(db);

  batch.set(messageRef, {
    from,
    authorUid: author.uid,
    authorName: author.name,
    body: trimmed,
    createdAt: now,
  });

  batch.update(ticketRef, {
    updatedAt: now,
    lastMessageAt: now,
    lastMessageFrom: from,
    lastMessagePreview: preview(trimmed),
    messageCount: (ticket.messageCount ?? 0) + 1,
    unreadForUser: from === 'support',
    unreadForSupport: from === 'user',
    // Closed is the one status a reply does not reopen: it means the user or the admin ended the
    // conversation on purpose.
    status: ticket.status === 'closed' ? 'closed' : 'open',
  });

  await batch.commit();
}

/** Live view of one user's tickets, newest activity first. */
export function subscribeToMyTickets(
  uid: string,
  onChange: (tickets: SupportTicket[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => {};
  }

  /*
   * Filtered but deliberately NOT ordered in the query.
   *
   * `where('uid','==',x)` alone rides Firestore's automatic single-field index. Adding
   * `orderBy('lastMessageAt')` to it makes this a composite query, which Firestore refuses until
   * somebody clicks through a console link to build the index — so the feature would appear to
   * work in every test and fail for the first real user, with an error nobody sees. Sorting fifty
   * of a person's own tickets in the client costs nothing and needs no infrastructure.
   */
  const q = query(collection(getFirebaseDb(), TICKET_COLLECTION), where('uid', '==', uid), limit(50));

  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs
          .map(toTicket)
          .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
      ),
    (err) => onError?.(err),
  );
}

/** Live view of one thread. The chat half of the feature — both sides see new messages arrive. */
export function subscribeToTicketMessages(
  ticketId: string,
  onChange: (messages: TicketMessage[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(getFirebaseDb(), TICKET_COLLECTION, ticketId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200),
  );

  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const data = d.data() as Partial<TicketMessage>;
          return {
            id: d.id,
            from: data.from ?? 'user',
            authorUid: data.authorUid ?? '',
            authorName: data.authorName ?? '',
            body: data.body ?? '',
            createdAt: data.createdAt ?? '',
          };
        }),
      ),
    (err) => onError?.(err),
  );
}

/** Every ticket, for the admin panel. */
export async function fetchAllTickets(): Promise<SupportTicket[]> {
  if (!isFirebaseConfigured()) return [];

  const q = query(
    collection(getFirebaseDb(), TICKET_COLLECTION),
    orderBy('lastMessageAt', 'desc'),
    limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map(toTicket);
}

export async function fetchTicket(ticketId: string): Promise<SupportTicket | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(doc(getFirebaseDb(), TICKET_COLLECTION, ticketId));
  return snap.exists() ? toTicket(snap) : null;
}

/** Clear the "someone is waiting on you" flag for whichever side just opened the thread. */
export async function markTicketRead(ticketId: string, side: TicketAuthor): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), TICKET_COLLECTION, ticketId), {
    [side === 'user' ? 'unreadForUser' : 'unreadForSupport']: false,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), TICKET_COLLECTION, ticketId), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateTicketPriority(ticketId: string, priority: AdminPriority): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), TICKET_COLLECTION, ticketId), { priority });
}

export async function updateTicketAdminNote(ticketId: string, adminNote: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), TICKET_COLLECTION, ticketId), {
    adminNote: adminNote.trim(),
  });
}

interface TicketSnapshotLike {
  id: string;
  data: () => Record<string, unknown> | undefined;
}

function toTicket(d: TicketSnapshotLike): SupportTicket {
  const data = (d.data() ?? {}) as Partial<SupportTicket>;
  return {
    id: d.id,
    uid: data.uid ?? '',
    email: data.email ?? '',
    username: data.username ?? null,
    subject: data.subject ?? '(no subject)',
    category: data.category ?? 'other',
    status: data.status ?? 'open',
    priority: data.priority,
    createdAt: data.createdAt ?? '',
    updatedAt: data.updatedAt ?? '',
    lastMessageAt: data.lastMessageAt ?? data.createdAt ?? '',
    lastMessageFrom: data.lastMessageFrom ?? 'user',
    lastMessagePreview: data.lastMessagePreview ?? '',
    messageCount: data.messageCount ?? 0,
    unreadForUser: data.unreadForUser ?? false,
    unreadForSupport: data.unreadForSupport ?? false,
    adminNote: data.adminNote,
    plan: data.plan ?? undefined,
    pageUrl: data.pageUrl,
    userAgent: data.userAgent,
  };
}
