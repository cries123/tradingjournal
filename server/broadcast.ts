import { randomBytes } from 'crypto';
import { AdminRequestError } from './adminAuth';
import { logEmails } from './emailLog';
import { broadcastEmail, type BroadcastKind } from './emailTemplates';
import { effectiveTier, type Entitlement } from './entitlements';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { isMailConfigured, MAX_BATCH, sendEmail, sendEmailBatch, siteUrl, type OutboundEmail } from './mailer';
import { unsubscribeUrl } from './unsubscribeToken';
import { BROADCAST_LIMITS } from '../src/config/adminMessage';
import type { Tier } from '../src/config/tiers';

/**
 * One email to every account, written in the admin panel's Email tab.
 *
 * The send is split into chunks of up to 100 people, stored before anything goes out
 * (`broadcasts/{id}/chunks/{n}`), and worked through by repeated calls from the open tab, because a
 * Netlify function gets ten seconds and a few thousand emails do not fit in one. Every chunk is one
 * Resend batch with its own idempotency key, so a call that dies mid-send can be repeated without
 * anybody getting the email twice. Both collections are server-only: no security rule names them,
 * so the browser is denied and nothing has to be published to the Firebase console.
 */

export type { BroadcastKind };
export type BroadcastAudience = 'all' | 'free' | 'paid' | 'silver' | 'gold' | 'diamond';
export const BROADCAST_AUDIENCES: BroadcastAudience[] = ['all', 'free', 'paid', 'silver', 'gold', 'diamond'];

const BROADCASTS = 'broadcasts';

/** One Resend batch per chunk: the provider's own ceiling. */
export const CHUNK_SIZE = MAX_BATCH;

/**
 * How long a call owns a chunk. Longer than any call can live (Netlify ends a synchronous function
 * at 10 s by default, 26 s at most), so a lease only runs out once the call holding it is gone, and
 * the chunk is then picked up again with the same idempotency key.
 */
export const LEASE_MS = 60_000;

/**
 * A chunk is only started with this much time left. A batch of 100 to Resend and the Firestore
 * writes around it take one to two seconds; the rest is margin for a slow provider.
 */
export const CHUNK_RESERVE_MS = 3_500;

/** The same, for one message at a time after a batch was refused. */
const SINGLE_RESERVE_MS = 800;

/**
 * Times a chunk may come back unsent — rate-limited, the provider down, or its call dying — before
 * the people left in it are counted as failed. Five strikes over the minutes a send takes is an
 * outage, not a blip, and a broadcast that retries forever never finishes or says what went wrong.
 */
export const MAX_STRIKES = 5;

/** Replies to a broadcast land in the support inbox, where somebody reads them. */
const REPLY_TO = 'support@trendchasers.net';

export interface BroadcastDraft {
  kind: BroadcastKind;
  audience: BroadcastAudience;
  subject: string;
  heading: string;
  body: string;
  preheader: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export interface Recipient {
  uid: string;
  email: string;
}

/** Who an audience reaches, and who it leaves out and why — said before anything is sent. */
export interface AudienceCounts {
  recipients: number;
  /** Unsubscribed from news. Only ever counted for news; a notice goes to them too. */
  optedOut: number;
  noEmail: number;
  disabled: number;
  /** On a plan outside the audience. */
  otherPlans: number;
  /** A second account with an address already on the list. */
  duplicates: number;
}

export interface BroadcastRecord extends BroadcastDraft {
  id: string;
  createdAt: string;
  createdBy: string;
  createdByEmail: string;
  status: 'sending' | 'done';
  total: number;
  chunkCount: number;
  sent: number;
  failed: number;
  remaining: number;
  counts: AudienceCounts;
  updatedAt: string;
  finishedAt: string | null;
}

export interface ChunkRecord {
  n: number;
  recipients: Recipient[];
  status: 'pending' | 'sending' | 'sent' | 'failed';
  leaseUntil: string | null;
  /** Times this chunk came back unsent. See MAX_STRIKES. */
  strikes: number;
  /** 'single' once the batch was refused outright: one message at a time from `next`. */
  mode: 'batch' | 'single';
  next: number;
  sent: number;
  failed: number;
  updatedAt: string;
}

/* ------------------------------------------------------------------ readiness */

export interface BroadcastReadiness {
  mail: boolean;
  unsubscribe: boolean;
  postalAddress: string | null;
}

/**
 * The sender's postal address, for the footer of news. US law (CAN-SPAM) requires a valid physical
 * address in every commercial email; a PO box or a virtual mailbox registered with the post office
 * satisfies it. Read from the environment so it is set once in Netlify and never typed into code.
 * Under ten characters is not an address, it is a placeholder.
 */
export function postalAddress(): string | null {
  const value = process.env.MAIL_POSTAL_ADDRESS?.trim().replace(/\s+/g, ' ');
  return value && value.length >= 10 ? value : null;
}

export function broadcastReadiness(): BroadcastReadiness {
  return {
    mail: isMailConfigured(),
    unsubscribe: unsubscribeUrl('https://trendchasers.net', 'readiness', 'news') !== null,
    postalAddress: postalAddress(),
  };
}

/** Why a kind cannot be sent right now, in words the admin can act on, or null when it can. */
export function readinessProblem(kind: BroadcastKind, ready: BroadcastReadiness = broadcastReadiness()): string | null {
  if (!ready.mail) return 'Email is not set up on the server: RESEND_API_KEY is missing in Netlify.';
  if (kind === 'news' && !ready.postalAddress) {
    return 'News needs a postal address in its footer, which US law (CAN-SPAM) requires in marketing email. Set MAIL_POSTAL_ADDRESS in Netlify; a PO box or virtual mailbox address is fine.';
  }
  if (kind === 'news' && !ready.unsubscribe) {
    return 'News needs a working unsubscribe link: EMAIL_TOKEN_SECRET is missing or under 16 characters in Netlify.';
  }
  return null;
}

/* ------------------------------------------------------------------ the draft */

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function oneLine(value: unknown): string {
  return text(value).trim().replace(/\s+/g, ' ');
}

/** An https address, normalized so it can sit inside an attribute; null for anything else. */
export function safeHttpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:') return null;
    return url.href.replace(/"/g, '%22');
  } catch {
    return null;
  }
}

/**
 * What the panel sent, checked. Refuses rather than trims: a subject cut short or a button with no
 * link is better caught in the panel than read by everybody.
 *
 * `confirmNotice` is the panel's tick box. An account notice reaches people who unsubscribed from
 * news, which is right for a change to the terms and wrong for a sale, so it is never the default
 * and never sent without the admin saying which it is.
 */
export function parseDraft(input: Record<string, unknown>, options: { confirmNotice: boolean }): BroadcastDraft {
  const kind = input.kind === 'news' || input.kind === 'notice' ? input.kind : null;
  if (!kind) throw new AdminRequestError('Choose news or an account notice.', 400);
  const audience = BROADCAST_AUDIENCES.find((a) => a === input.audience);
  if (!audience) throw new AdminRequestError('Choose who it goes to.', 400);

  const subject = oneLine(input.subject);
  const heading = oneLine(input.heading) || subject;
  const body = text(input.body).trim();
  const preheader = oneLine(input.preheader) || null;
  const ctaLabel = oneLine(input.ctaLabel) || null;
  const rawUrl = text(input.ctaUrl).trim();
  const ctaUrl = rawUrl ? safeHttpsUrl(rawUrl) : null;

  const L = BROADCAST_LIMITS;
  if (!subject) throw new AdminRequestError('A subject is required.', 400);
  if (subject.length > L.subject) throw new AdminRequestError(`Keep the subject under ${L.subject} characters.`, 400);
  if (heading.length > L.heading) throw new AdminRequestError(`Keep the heading under ${L.heading} characters.`, 400);
  if (!body) throw new AdminRequestError('Write something to send.', 400);
  if (body.length > L.body) throw new AdminRequestError(`Keep the message under ${L.body} characters.`, 400);
  if (preheader && preheader.length > L.preheader) {
    throw new AdminRequestError(`Keep the preview line under ${L.preheader} characters.`, 400);
  }
  if (rawUrl && !ctaUrl) throw new AdminRequestError('The button link has to be a full https:// address.', 400);
  if (ctaLabel && ctaLabel.length > L.ctaLabel) throw new AdminRequestError(`Keep the button under ${L.ctaLabel} characters.`, 400);
  if (Boolean(ctaLabel) !== Boolean(ctaUrl)) {
    throw new AdminRequestError('Give the button both a label and a link, or leave both empty.', 400);
  }
  if (kind === 'notice' && options.confirmNotice && input.noticeConfirmed !== true) {
    throw new AdminRequestError(
      'Tick the box confirming this is about their account, not a promotion. Account notices also reach people who unsubscribed from news.',
      400,
    );
  }

  return { kind, audience, subject, heading, body, preheader, ctaLabel, ctaUrl };
}

/* ------------------------------------------------------------------ who it goes to */

export interface AccountRow {
  uid: string;
  email?: string | null;
  disabled?: boolean;
}

function usableEmail(value: string | null | undefined): string | null {
  const email = value?.trim() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function inAudience(tier: Tier, audience: BroadcastAudience): boolean {
  if (audience === 'all') return true;
  if (audience === 'free') return tier === 'free';
  if (audience === 'paid') return tier !== 'free';
  return tier === audience;
}

/**
 * The recipient list, from every account, the plan each is on today and who has unsubscribed.
 *
 * In this order on purpose: a disabled account or one with no address is out whatever else is true;
 * the plan filter comes before the opt-out so "37 unsubscribed" counts only people in the audience;
 * and the opt-out applies to news alone. An address on two accounts is sent one email.
 */
export function chooseRecipients(
  accounts: AccountRow[],
  tiers: Map<string, Tier>,
  optedOut: Set<string>,
  audience: BroadcastAudience,
  kind: BroadcastKind,
): { recipients: Recipient[]; counts: AudienceCounts } {
  const counts: AudienceCounts = { recipients: 0, optedOut: 0, noEmail: 0, disabled: 0, otherPlans: 0, duplicates: 0 };
  const recipients: Recipient[] = [];
  const seen = new Set<string>();

  for (const account of accounts) {
    if (account.disabled) {
      counts.disabled += 1;
      continue;
    }
    const email = usableEmail(account.email);
    if (!email) {
      counts.noEmail += 1;
      continue;
    }
    if (!inAudience(tiers.get(account.uid) ?? 'free', audience)) {
      counts.otherPlans += 1;
      continue;
    }
    if (kind === 'news' && optedOut.has(account.uid)) {
      counts.optedOut += 1;
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      counts.duplicates += 1;
      continue;
    }
    seen.add(key);
    recipients.push({ uid: account.uid, email });
  }

  counts.recipients = recipients.length;
  return { recipients, counts };
}

async function loadAccounts(): Promise<AccountRow[]> {
  const rows: AccountRow[] = [];
  let pageToken: string | undefined;
  do {
    // 1,000 is the most listUsers returns in one page.
    const page = await getAdminAuth().listUsers(1000, pageToken);
    for (const user of page.users) rows.push({ uid: user.uid, email: user.email, disabled: user.disabled });
    pageToken = page.pageToken;
  } while (pageToken);
  return rows;
}

/**
 * Every account's plan today, read the way every gate reads it (effectiveTier): a lapsed
 * subscription is free, a comped one counts as the plan it was given. An account with no
 * entitlement record is free. One read of the whole collection, not one per account.
 */
async function loadTiers(now: number): Promise<Map<string, Tier>> {
  const snap = await getAdminFirestore().collection('entitlements').get();
  const tiers = new Map<string, Tier>();
  for (const doc of snap.docs) tiers.set(doc.id, effectiveTier(doc.data() as Entitlement, now));
  return tiers;
}

async function loadOptedOut(): Promise<Set<string>> {
  const snap = await getAdminFirestore().collection('emailPrefs').where('news', '==', false).get();
  return new Set(snap.docs.map((d) => d.id));
}

export async function selectRecipients(
  audience: BroadcastAudience,
  kind: BroadcastKind,
  now: number = Date.now(),
): Promise<{ recipients: Recipient[]; counts: AudienceCounts }> {
  const [accounts, tiers, optedOut] = await Promise.all([
    loadAccounts(),
    audience === 'all' ? Promise.resolve(new Map<string, Tier>()) : loadTiers(now),
    kind === 'news' ? loadOptedOut() : Promise.resolve(new Set<string>()),
  ]);
  return chooseRecipients(accounts, tiers, optedOut, audience, kind);
}

/* ------------------------------------------------------------------ the email */

/**
 * The email one person gets. Deterministic for a given broadcast and person — the same HTML, the
 * same signed unsubscribe link — which is what lets a retry reuse its idempotency key.
 */
export function messageFor(draft: BroadcastDraft, recipient: Recipient, base: string = siteUrl()): OutboundEmail {
  const unsubscribe = draft.kind === 'news' ? unsubscribeUrl(base, recipient.uid, 'news') : null;
  const mail = broadcastEmail({
    kind: draft.kind,
    subject: draft.subject,
    heading: draft.heading,
    body: draft.body,
    preheader: draft.preheader,
    ctaLabel: draft.ctaLabel,
    ctaUrl: draft.ctaUrl,
    siteUrl: base,
    unsubscribeUrl: unsubscribe,
    postalAddress: postalAddress(),
  });
  return {
    to: recipient.email,
    ...mail,
    replyTo: REPLY_TO,
    tag: 'broadcast',
    // The mail client's own unsubscribe button (RFC 8058). Gmail and Yahoo require both headers of
    // anyone sending to their users in bulk, and mark the mail as spam more readily without them.
    ...(unsubscribe
      ? { headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
      : {}),
  };
}

/* ------------------------------------------------------------------ storage */

const iso = (ms: number) => new Date(ms).toISOString();
const chunkId = (n: number) => String(n).padStart(4, '0');

function broadcastRef(id: string) {
  return getAdminFirestore().collection(BROADCASTS).doc(id);
}

function chunksOf(id: string) {
  return getAdminFirestore().collection(`${BROADCASTS}/${id}/chunks`);
}

/** Sortable by time, unguessable after it. */
function newBroadcastId(now: number): string {
  return `${iso(now).replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`;
}

export async function createBroadcast(
  draft: BroadcastDraft,
  admin: { uid: string; email: string },
  now: number = Date.now(),
): Promise<BroadcastRecord> {
  const problem = readinessProblem(draft.kind);
  if (problem) throw new AdminRequestError(problem, 503);

  const { recipients, counts } = await selectRecipients(draft.audience, draft.kind, now);
  if (recipients.length === 0) throw new AdminRequestError('Nobody is in that audience.', 400);

  const id = newBroadcastId(now);
  const db = getAdminFirestore();
  const groups: Recipient[][] = [];
  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) groups.push(recipients.slice(i, i + CHUNK_SIZE));

  /*
   * The chunks first, the broadcast last. A create that dies halfway then leaves chunks nothing
   * points at, which is harmless, rather than a broadcast that would quietly skip whoever was in the
   * chunks that never got written. 400 per write batch keeps each one under Firestore's 500.
   */
  for (let i = 0; i < groups.length; i += 400) {
    const batch = db.batch();
    groups.slice(i, i + 400).forEach((group, j) => {
      const n = i + j;
      const chunk: ChunkRecord = {
        n,
        recipients: group,
        status: 'pending',
        leaseUntil: null,
        strikes: 0,
        mode: 'batch',
        next: 0,
        sent: 0,
        failed: 0,
        updatedAt: iso(now),
      };
      batch.set(chunksOf(id).doc(chunkId(n)), chunk);
    });
    await batch.commit();
  }

  const record: BroadcastRecord = {
    ...draft,
    id,
    createdAt: iso(now),
    createdBy: admin.uid,
    createdByEmail: admin.email,
    status: 'sending',
    total: recipients.length,
    chunkCount: groups.length,
    sent: 0,
    failed: 0,
    remaining: recipients.length,
    counts,
    updatedAt: iso(now),
    finishedAt: null,
  };
  await broadcastRef(id).set(record);
  return record;
}

function leaseExpired(chunk: ChunkRecord, now: number): boolean {
  return !chunk.leaseUntil || Date.parse(chunk.leaseUntil) <= now;
}

/**
 * Takes the next chunk nobody is working on: a pending one, or one whose call died holding it.
 *
 * Inside a transaction, so two open tabs (or a retry overlapping the call it retries) can never both
 * send the same chunk. Equality queries without an orderBy, which come back in document-id order
 * (the zero-padded chunk number) and need no composite index deployed by hand.
 */
async function claimNextChunk(id: string, now: number): Promise<ChunkRecord | null> {
  const db = getAdminFirestore();
  const pending = await chunksOf(id).where('status', '==', 'pending').limit(5).get();
  const stalled = await chunksOf(id).where('status', '==', 'sending').limit(20).get();
  const candidates = [...pending.docs, ...stalled.docs.filter((d) => leaseExpired(d.data() as ChunkRecord, now))];

  for (const doc of candidates) {
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const chunk = fresh.data() as ChunkRecord | undefined;
      if (!chunk) return null;
      const abandoned = chunk.status === 'sending' && leaseExpired(chunk, now);
      if (chunk.status !== 'pending' && !abandoned) return null;
      // A chunk picked up from a call that died counts as a strike: that call may have been the
      // provider hanging, and a chunk that kills every call that touches it must end eventually.
      const update = {
        status: 'sending' as const,
        leaseUntil: iso(now + LEASE_MS),
        strikes: chunk.strikes + (abandoned ? 1 : 0),
        updatedAt: iso(now),
      };
      tx.update(doc.ref, update);
      return { ...chunk, ...update };
    });
    if (claimed) return claimed;
  }
  return null;
}

type ChunkOutcome = 'done' | 'retry-later' | 'out-of-time';

async function sendChunk(
  broadcast: BroadcastRecord,
  chunk: ChunkRecord,
  deadline: number,
  clock: () => number,
): Promise<ChunkOutcome> {
  const ref = chunksOf(broadcast.id).doc(chunkId(chunk.n));
  const key = `broadcast-${broadcast.id}-${chunkId(chunk.n)}`;

  if (chunk.strikes >= MAX_STRIKES) {
    const rest = chunk.recipients.slice(chunk.next);
    const at = iso(clock());
    await logEmails(
      rest.map((r) => ({ to: r.email.toLowerCase(), subject: broadcast.subject, tag: 'broadcast', at, sent: false, reason: 'provider-error', providerId: null })),
    );
    await ref.update({ status: 'failed', next: chunk.recipients.length, failed: chunk.failed + rest.length, leaseUntil: null, updatedAt: at });
    return 'done';
  }

  let mode = chunk.mode;
  if (mode === 'batch') {
    const result = await sendEmailBatch(
      chunk.recipients.map((r) => messageFor(broadcast, r)),
      key,
    );
    if (result.ok) {
      await ref.update({ status: 'sent', next: chunk.recipients.length, sent: chunk.recipients.length, leaseUntil: null, updatedAt: iso(clock()) });
      return 'done';
    }
    if (result.retryable) {
      await ref.update({ status: 'pending', strikes: chunk.strikes + 1, leaseUntil: null, updatedAt: iso(clock()) });
      return 'retry-later';
    }
    /*
     * Refused outright, which with the addresses already checked almost always means one of them is
     * an address the provider will not take. One at a time from here, so one bad address costs one
     * email and not the hundred it was batched with. Each keeps an idempotency key of its own.
     */
    mode = 'single';
    await ref.update({ mode, updatedAt: iso(clock()) });
  }

  /*
   * Progress is written only when the call stops. If it dies first, the next call starts this chunk
   * again from the last saved `next` and re-sends with the same per-message keys, which the provider
   * answers from its record instead of sending again.
   */
  let { next, sent, failed } = chunk;
  while (next < chunk.recipients.length) {
    if (clock() + SINGLE_RESERVE_MS >= deadline) {
      await ref.update({ status: 'pending', next, sent, failed, leaseUntil: null, updatedAt: iso(clock()) });
      return 'out-of-time';
    }
    const outcome = await sendEmail({ ...messageFor(broadcast, chunk.recipients[next]), idempotencyKey: `${key}-${next}` });
    if (!outcome.sent && outcome.retryable) {
      await ref.update({ status: 'pending', next, sent, failed, strikes: chunk.strikes + 1, leaseUntil: null, updatedAt: iso(clock()) });
      return 'retry-later';
    }
    if (outcome.sent) sent += 1;
    else failed += 1;
    next += 1;
  }
  await ref.update({ status: 'sent', next, sent, failed, leaseUntil: null, updatedAt: iso(clock()) });
  return 'done';
}

/** Totals from the chunks themselves, so the record can never drift from what was sent. */
async function refreshProgress(broadcast: BroadcastRecord, now: number): Promise<BroadcastRecord> {
  const snap = await chunksOf(broadcast.id).get();
  let sent = 0;
  let failed = 0;
  let settled = 0;
  for (const doc of snap.docs) {
    const chunk = doc.data() as ChunkRecord;
    sent += chunk.sent;
    failed += chunk.failed;
    if (chunk.status === 'sent' || chunk.status === 'failed') settled += 1;
  }
  const done = settled >= broadcast.chunkCount;
  const update = {
    sent,
    failed,
    remaining: Math.max(0, broadcast.total - sent - failed),
    status: done ? ('done' as const) : ('sending' as const),
    finishedAt: done ? (broadcast.finishedAt ?? iso(now)) : null,
    updatedAt: iso(now),
  };
  await broadcastRef(broadcast.id).update(update);
  return { ...broadcast, ...update };
}

/**
 * Sends as many chunks as fit before `deadline`, then reports where the broadcast stands.
 *
 * `waiting` means the provider asked for a pause (rate limit or outage): the panel waits a few
 * seconds before the next call rather than hammering it.
 */
export async function sendNextChunks(
  id: string,
  deadline: number,
  clock: () => number = Date.now,
): Promise<{ broadcast: BroadcastRecord; waiting: boolean }> {
  const snap = await broadcastRef(id).get();
  if (!snap.exists) throw new AdminRequestError('No broadcast with that id.', 404);
  const broadcast = snap.data() as BroadcastRecord;
  if (broadcast.status === 'done') return { broadcast, waiting: false };

  const problem = readinessProblem(broadcast.kind);
  if (problem) throw new AdminRequestError(problem, 503);

  let waiting = false;
  while (clock() + CHUNK_RESERVE_MS < deadline) {
    const chunk = await claimNextChunk(id, clock());
    if (!chunk) break;
    const outcome = await sendChunk(broadcast, chunk, deadline, clock);
    if (outcome === 'retry-later') {
      waiting = true;
      break;
    }
    if (outcome === 'out-of-time') break;
  }
  return { broadcast: await refreshProgress(broadcast, clock()), waiting };
}

/** The most recent broadcasts, newest first. */
export async function listBroadcasts(max = 20): Promise<BroadcastRecord[]> {
  const snap = await getAdminFirestore().collection(BROADCASTS).orderBy('createdAt', 'desc').limit(max).get();
  return snap.docs.map((d) => d.data() as BroadcastRecord);
}

/**
 * The email exactly as one person would get it, sent to the admin. Allowed while news still lacks
 * its postal address, so the wording can be checked before that is sorted; the real send is not.
 */
export async function sendTestEmail(draft: BroadcastDraft, admin: { uid: string; email: string }): Promise<string> {
  if (!isMailConfigured()) throw new AdminRequestError('Email is not set up on the server: RESEND_API_KEY is missing in Netlify.', 503);
  const message = messageFor(draft, { uid: admin.uid, email: admin.email });
  const outcome = await sendEmail({ ...message, subject: `[Test] ${message.subject}`, tag: 'broadcast-test' });
  if (!outcome.sent) throw new AdminRequestError('The test did not send — the email provider refused it.', 502);
  return `Test sent to ${admin.email}`;
}

/** What the preview pane shows: the real template, for the admin as the recipient. */
export function previewFor(draft: BroadcastDraft, admin: { uid: string; email: string }): { subject: string; html: string; text: string } {
  const message = messageFor(draft, { uid: admin.uid, email: admin.email });
  return { subject: message.subject, html: message.html, text: message.text };
}
