import { logServerError } from './errorReports';
import { logEmail, logEmails } from './emailLog';

/**
 * Outbound email, with one provider behind a thin interface.
 *
 * Two things in this product were waiting on this. A support reply only existed inside the app, so
 * anyone who opened a ticket and closed the tab found out on their next visit — which for an
 * anxious "I paid and didn't get my plan" is far too late. And computeWeeklyRecap had been
 * computing a genuinely good Sunday summary with nowhere to send it.
 *
 * Resend is the provider; everything above it goes through `sendEmail`, so replacing it is this
 * file and nothing else. Nothing here ever throws: a mail failure must not turn a successful
 * support reply into an error the admin sees, or take down a scheduled job halfway through a list
 * of users.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Shows up in the provider's dashboard, so failures can be traced to a feature. */
  tag?: string;
  /** Extra MIME headers — List-Unsubscribe on the emails that go to everybody. */
  headers?: Record<string, string>;
  /**
   * Makes a retry of the same send harmless: the provider answers a repeated key with the original
   * result for 24 hours instead of sending again. Used where a send can be retried after a call
   * died not knowing whether it went out (server/broadcast.ts).
   */
  idempotencyKey?: string;
}

export type SendOutcome =
  | { sent: true; id: string | null }
  | {
      sent: false;
      reason: 'not-configured' | 'invalid-recipient' | 'provider-error';
      /** True when trying again later could work: the provider was rate-limiting or down. */
      retryable?: boolean;
    };

/** What a batch send came to. On success, ids line up with the messages passed in. */
export type BatchOutcome =
  | { ok: true; ids: (string | null)[] }
  | { ok: false; retryable: boolean; reason: 'not-configured' | 'provider-error'; status: number | null };

const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';

/** Resend takes at most 100 messages per batch call. */
export const MAX_BATCH = 100;

/**
 * 429 is Resend's rate limit (10 requests a second per team) and 5xx is Resend having a bad
 * minute: both are worth trying again with the same idempotency key. Anything else in the 4xx range
 * is the request itself, and sending it again would only fail again.
 */
function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function payloadFor(message: OutboundEmail) {
  return {
    from: fromAddress(),
    to: [message.to.trim()],
    subject: message.subject,
    html: message.html,
    // Always both parts. A text/plain alternative is most of what keeps a transactional mail
    // out of a spam folder, and it is the version some people actually read.
    text: message.text,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    ...(message.tag ? { tags: [{ name: 'feature', value: message.tag }] } : {}),
    ...(message.headers ? { headers: message.headers } : {}),
  };
}

/**
 * Up to 100 messages in one call, for the email that goes to everybody.
 *
 * One request per hundred people instead of one each, which is what keeps a send to a few thousand
 * accounts inside Netlify's ten seconds a call and under Resend's rate limit. Every message that
 * went is logged here, like sendEmail does. A batch that fails is not logged per recipient: the
 * caller either retries it with the same key or sends the messages one at a time through sendEmail,
 * which logs each attempt itself. Never throws.
 */
export async function sendEmailBatch(messages: OutboundEmail[], idempotencyKey: string): Promise<BatchOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, retryable: false, reason: 'not-configured', status: null };
  if (messages.length === 0) return { ok: true, ids: [] };
  if (messages.length > MAX_BATCH) throw new Error(`sendEmailBatch takes at most ${MAX_BATCH} messages`);

  try {
    const res = await fetch(RESEND_BATCH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(messages.map(payloadFor)),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[mailer] batch refused (${res.status}): ${body.slice(0, 300)}`);
      await logServerError('email-send', new Error(`Resend batch ${res.status}: ${body.slice(0, 300)}`));
      return { ok: false, retryable: retryableStatus(res.status), reason: 'provider-error', status: res.status };
    }

    const data = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
    const ids = messages.map((_, i) => data?.data?.[i]?.id ?? null);
    const at = new Date().toISOString();
    await logEmails(
      messages.map((m, i) => ({
        to: m.to.trim().toLowerCase(),
        subject: m.subject,
        tag: m.tag ?? null,
        at,
        sent: true,
        reason: null,
        providerId: ids[i],
      })),
    );
    return { ok: true, ids };
  } catch (err) {
    // The request may or may not have reached Resend. Retrying with the same key is safe either way.
    console.error('[mailer] batch send failed:', err);
    await logServerError('email-send', err);
    return { ok: false, retryable: true, reason: 'provider-error', status: null };
  }
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** SITE_URL is already set for broker-connect redirects and share links; reusing it means one
 *  fewer variable to get wrong, and links in email can never point somewhere the app doesn't. */
export function siteUrl(): string {
  return (process.env.SITE_URL || 'https://trendchasers.net').replace(/\/$/, '');
}

function fromAddress(): string {
  return process.env.MAIL_FROM || 'Trend Chasers <support@trendchasers.net>';
}

/** Deliberately loose — the job here is to catch an empty or obviously broken value, not to
 *  re-derive RFC 5322 and start refusing addresses that work. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendEmail(message: OutboundEmail): Promise<SendOutcome> {
  const outcome = await deliver(message);
  // Every attempt, sent or not, so the admin panel can answer "did it go out, and if not why".
  // Logged after the attempt rather than around it: the log is a note about the send, not a gate.
  await logEmail({
    to: message.to.trim().toLowerCase(),
    subject: message.subject,
    tag: message.tag ?? null,
    at: new Date().toISOString(),
    sent: outcome.sent,
    reason: outcome.sent ? null : outcome.reason,
    providerId: outcome.sent ? outcome.id : null,
  });
  return outcome;
}

async function deliver(message: OutboundEmail): Promise<SendOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Not an error. The product is designed to work with no mail provider at all — the in-app
    // unread badge is the fallback — so this is just the state before a key is added.
    console.info(`[mailer] skipped "${message.subject}" — no RESEND_API_KEY set`);
    return { sent: false, reason: 'not-configured' };
  }

  if (!looksLikeEmail(message.to)) {
    console.warn('[mailer] refusing to send to an unusable address');
    return { sent: false, reason: 'invalid-recipient' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify(payloadFor(message)),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[mailer] provider refused (${res.status}): ${body.slice(0, 300)}`);
      await logServerError('email-send', new Error(`Resend ${res.status}: ${body.slice(0, 300)}`));
      return { sent: false, reason: 'provider-error', retryable: retryableStatus(res.status) };
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    console.error('[mailer] send failed:', err);
    await logServerError('email-send', err);
    return { sent: false, reason: 'provider-error', retryable: true };
  }
}
