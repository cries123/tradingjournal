import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { AdminRequestError } from './adminAuth';
import { supportMessageEmail } from './emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from './mailer';
import { SUPPORT_THREAD_LIMITS } from '../src/config/adminMessage';

/**
 * Support starting a conversation, rather than answering one.
 *
 * Email reached the person but left the conversation outside the product: they reply to an inbox,
 * and the next person helping them cannot see what was said. A ticket opened on their behalf puts
 * the message in their Support inbox with the unread badge on the sidebar, and they answer in the
 * same thread every other support conversation uses.
 *
 * Written with the Admin SDK because the rules only let a user open a ticket for themselves
 * (validTicketCreate pins `uid` to the caller), and widening that rule for an admin would be the one
 * part of this that needs a rules deploy. No rule changes, so nothing to publish.
 */

/** The ticket rules' own bounds, shared with the composer so the two never disagree. */
const SUPPORT_SUBJECT_MIN = SUPPORT_THREAD_LIMITS.subjectMin;
const SUPPORT_SUBJECT_MAX = SUPPORT_THREAD_LIMITS.subject;
const SUPPORT_BODY_MAX = SUPPORT_THREAD_LIMITS.body;

/** The author name support replies already use, so the thread reads as one voice. */
const SUPPORT_NAME = 'Trend Chasers support';

export interface OpenedSupportThread {
  ticketId: string;
  /** Whether the "you have a message" email went out. The ticket is there either way. */
  emailed: boolean;
}

function preview(body: string): string {
  return body.trim().replace(/\s+/g, ' ').slice(0, 140);
}

export async function openSupportThread(
  deps: { db: Firestore; auth: Auth },
  input: { targetUid: string; adminUid: string; subject: unknown; message: unknown },
): Promise<OpenedSupportThread> {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.message === 'string' ? input.message.trim() : '';
  if (subject.length < SUPPORT_SUBJECT_MIN || subject.length > SUPPORT_SUBJECT_MAX) {
    throw new AdminRequestError(`Give it a subject between ${SUPPORT_SUBJECT_MIN} and ${SUPPORT_SUBJECT_MAX} characters.`, 400);
  }
  if (body.length === 0 || body.length > SUPPORT_BODY_MAX) {
    throw new AdminRequestError(`Write a message of up to ${SUPPORT_BODY_MAX} characters.`, 400);
  }

  // The address and name come from the account, never from anything the panel sent — the same rule
  // ticket-notify follows, and for the same reason: a recipient is not something to take on trust.
  const account = await deps.auth.getUser(input.targetUid).catch(() => null);
  if (!account) throw new AdminRequestError('That account no longer exists.', 404);
  const profile = await deps.db.doc(`users/${input.targetUid}`).get();
  const username = (profile.data() as { username?: string } | undefined)?.username?.trim() || null;

  const now = new Date().toISOString();
  const ticketRef = deps.db.collection('supportTickets').doc();
  const messageRef = ticketRef.collection('messages').doc();

  const batch = deps.db.batch();
  batch.set(ticketRef, {
    uid: input.targetUid,
    email: account.email ?? '',
    username,
    subject,
    category: 'other',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastMessageFrom: 'support',
    lastMessagePreview: preview(body),
    messageCount: 1,
    // Unread for them, which is what lights the badge on their sidebar.
    unreadForUser: true,
    unreadForSupport: false,
    plan: null,
    pageUrl: '',
    userAgent: '',
    // So the queue can tell a thread support started from one the trader opened.
    openedBy: 'support',
  });
  batch.set(messageRef, {
    from: 'support',
    authorUid: input.adminUid,
    authorName: SUPPORT_NAME,
    body,
    createdAt: now,
  });
  await batch.commit();

  /*
   * The email is a notice that the message exists, not the message itself, and its failure never
   * fails the action: the thread is saved and badged in the app, and telling the admin it failed
   * when it did not is how a message gets sent twice.
   */
  let emailed = false;
  if (account.email && isMailConfigured()) {
    try {
      const mail = supportMessageEmail({ subject, preview: body, siteUrl: siteUrl() });
      const outcome = await sendEmail({
        to: account.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: 'support@trendchasers.net',
        tag: 'support-message',
      });
      emailed = outcome.sent;
      if (emailed) await ticketRef.set({ lastNotifiedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.warn('[admin-support-message] notice email failed:', err);
    }
  }

  return { ticketId: ticketRef.id, emailed };
}
