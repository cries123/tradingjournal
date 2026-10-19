import { getAdminFirestore } from './firebaseAdmin';

/**
 * A record of every email the product sends.
 *
 * Eleven kinds of mail go out — support replies, trial nudges, the Sunday recap, billing notices —
 * and until this there was no record of any of them. "Did my trial email send?" and "why did I
 * get this?" were unanswerable from the panel; the only trace was the provider's dashboard. One
 * row per send, written by the mailer itself so no caller can forget, read back on the user's card
 * and as a recent list on the Ops tab.
 *
 * Never throws: a failure to log a send must not fail the send.
 */
export const EMAIL_LOG = 'emailLog';

export interface EmailLogEntry {
  id?: string;
  to: string;
  subject: string;
  /** The feature that sent it — the mailer's tag. */
  tag: string | null;
  at: string;
  sent: boolean;
  /** Why it was not sent, when it was not. */
  reason: string | null;
  /** The provider's id for the message, for tracing a bounce in its dashboard. */
  providerId: string | null;
}

export async function logEmail(entry: Omit<EmailLogEntry, 'id'>): Promise<void> {
  try {
    await getAdminFirestore().collection(EMAIL_LOG).add(entry);
  } catch (err) {
    console.error('[email-log] could not record a send:', err);
  }
}

/** The most recent sends, newest first. */
export async function readRecentEmails(max = 100): Promise<EmailLogEntry[]> {
  const snap = await getAdminFirestore().collection(EMAIL_LOG).orderBy('at', 'desc').limit(max).get();
  return snap.docs.map((d) => ({ ...(d.data() as EmailLogEntry), id: d.id }));
}

/**
 * Everything sent to one address, newest first. An equality filter with no orderBy, sorted here,
 * so it needs no composite index to deploy.
 */
export async function readEmailsTo(address: string, max = 50): Promise<EmailLogEntry[]> {
  const to = address.trim().toLowerCase();
  if (!to) return [];
  const snap = await getAdminFirestore().collection(EMAIL_LOG).where('to', '==', to).limit(max).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as EmailLogEntry), id: d.id }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
