import type { Handler } from '@netlify/functions';
import { assertCallerIsAdmin, AdminRequestError, getBearerToken } from '../../server/adminAuth';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import { logServerError } from '../../server/errorReports';
import { ticketReplyEmail } from '../../server/emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from '../../server/mailer';

/**
 * Emails a trader that support has replied to their ticket.
 *
 * Called by the admin panel right after a reply is written, rather than triggered from the
 * database, because this project has no Cloud Functions and adding them for one notification would
 * mean a second deployment target to keep alive. Admin-only: anyone who could call this could make
 * the product email arbitrary users on demand.
 *
 * Failure here is deliberately not surfaced to the admin as an error. The reply is already saved
 * and already visible in the app with an unread badge against it; a bounced notification is a
 * degraded nicety, not a failed action, and telling somebody their reply failed when it didn't
 * would make them send it twice.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = getBearerToken(event.headers);
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing credentials' }) };
  }

  try {
    await assertCallerIsAdmin(token);
  } catch (err) {
    const status = err instanceof AdminRequestError ? err.statusCode : 401;
    return { statusCode: status, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body: { ticketId?: string };
  try {
    body = JSON.parse(event.body || '{}') as { ticketId?: string };
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
  if (!ticketId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ticketId is required' }) };
  }

  if (!isMailConfigured()) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notified: false, reason: 'not-configured' }),
    };
  }

  try {
    const db = getAdminFirestore();
    const snap = await db.doc(`supportTickets/${ticketId}`).get();
    if (!snap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ticket not found' }) };
    }

    const ticket = snap.data() as {
      email?: string;
      subject?: string;
      lastMessagePreview?: string;
      lastMessageFrom?: string;
    };

    // Only ever notify about a message that came FROM support. If the last word was the user's,
    // there is nothing to tell them and the email would read as a reply that never happened.
    if (ticket.lastMessageFrom !== 'support') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notified: false, reason: 'no-support-reply' }),
      };
    }

    if (!ticket.email) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notified: false, reason: 'no-address' }),
      };
    }

    const mail = ticketReplyEmail({
      ticketSubject: ticket.subject || 'your support ticket',
      preview: ticket.lastMessagePreview || '',
      siteUrl: siteUrl(),
    });

    const outcome = await sendEmail({
      to: ticket.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: 'support@trendchasers.net',
      tag: 'ticket-reply',
    });

    if (outcome.sent) {
      await snap.ref
        .set({ lastNotifiedAt: new Date().toISOString() }, { merge: true })
        .catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notified: outcome.sent }),
    };
  } catch (err) {
    console.error('[ticket-notify] failed:', err);
    logServerError('ticket-notify', err);
    // 200, for the reason in the header comment: the reply itself succeeded.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notified: false, reason: 'error' }),
    };
  }
};
