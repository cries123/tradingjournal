import { logServerError } from './errorReports';

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
}

export type SendOutcome =
  | { sent: true; id: string | null }
  | { sent: false; reason: 'not-configured' | 'invalid-recipient' | 'provider-error' };

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
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to.trim()],
        subject: message.subject,
        html: message.html,
        // Always both parts. A text/plain alternative is most of what keeps a transactional mail
        // out of a spam folder, and it is the version some people actually read.
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.tag ? { tags: [{ name: 'feature', value: message.tag }] } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[mailer] provider refused (${res.status}): ${body.slice(0, 300)}`);
      logServerError('email-send', new Error(`Resend ${res.status}: ${body.slice(0, 300)}`));
      return { sent: false, reason: 'provider-error' };
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    console.error('[mailer] send failed:', err);
    logServerError('email-send', err);
    return { sent: false, reason: 'provider-error' };
  }
}
