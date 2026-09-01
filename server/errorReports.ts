import admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { normalizeError, safePath, shouldReport, type ErrorKind } from '../src/services/errorFingerprint';

/**
 * Where production failures are written down.
 *
 * One document per distinct bug, keyed by fingerprint, holding a count and a sample rather than one
 * document per occurrence. That shape is deliberate: a render loop can fire a crash a thousand
 * times a minute, and a log that grows a document per occurrence would cost more than the product
 * makes and be unreadable besides. Grouped, the same storm is one row that says "1,214 times, 3
 * users, started 14 minutes ago" — which is the sentence somebody actually needs.
 *
 * Every write here goes through the Admin SDK, so the security rules deny clients outright. A
 * client that could write this collection could forge failures, and a client that could read it
 * would be reading other people's stack traces.
 */

const COLLECTION = 'errorEvents';
const BUDGET_COLLECTION = 'errorBudget';

/**
 * The most error occurrences recorded in one day.
 *
 * Not a cost optimisation so much as a fuse. Anyone can POST to the report endpoint — it has to
 * accept reports from signed-out visitors, because signed-out visitors crash too — so without a
 * ceiling a single script could spend the Firestore quota and take the journal down with it. Past
 * the cap reports are counted and dropped; the counter itself is what tells the admin panel that
 * dropping happened.
 */
const DAILY_EVENT_BUDGET = 2000;

/** How many distinct users to name per bug. Enough to tell "everyone" from "one person". */
const MAX_TRACKED_UIDS = 25;

export type ErrorStatus = 'open' | 'resolved' | 'ignored';

export interface ErrorReportInput {
  fingerprint: string;
  kind: ErrorKind;
  name: string;
  message: string;
  stack: string;
  scope: string | null;
  path: string;
  release: string;
  userAgent: string;
  uid: string | null;
}

export type RecordOutcome = 'stored' | 'over-budget' | 'ignored' | 'unavailable';

function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Record one occurrence.
 *
 * A transaction, not a blind merge, for two reasons: firstSeenAt and the admin's resolved/ignored
 * status must survive every later occurrence of the same bug, and the affected-user list has to
 * stop growing at some point rather than expanding a document until Firestore refuses it.
 */
export async function recordErrorEvent(input: ErrorReportInput): Promise<RecordOutcome> {
  if (!shouldReport({ kind: input.kind, message: input.message, stack: input.stack, scope: input.scope })) {
    return 'ignored';
  }

  const db = getAdminFirestore();
  const nowIso = new Date().toISOString();
  const day = utcDay();

  const eventRef = db.collection(COLLECTION).doc(input.fingerprint);
  const budgetRef = db.collection(BUDGET_COLLECTION).doc(day);

  return db.runTransaction(async (tx) => {
    const [budgetSnap, eventSnap] = await Promise.all([tx.get(budgetRef), tx.get(eventRef)]);

    const used = (budgetSnap.data()?.count as number | undefined) ?? 0;
    if (used >= DAILY_EVENT_BUDGET) {
      tx.set(budgetRef, { day, dropped: admin.firestore.FieldValue.increment(1) }, { merge: true });
      return 'over-budget' as const;
    }

    tx.set(budgetRef, { day, count: admin.firestore.FieldValue.increment(1) }, { merge: true });

    const existing = eventSnap.data();
    const priorUids = (existing?.affectedUids as string[] | undefined) ?? [];
    const affectedUids =
      input.uid && !priorUids.includes(input.uid) && priorUids.length < MAX_TRACKED_UIDS
        ? [...priorUids, input.uid]
        : priorUids;

    tx.set(
      eventRef,
      {
        fingerprint: input.fingerprint,
        kind: input.kind,
        name: input.name,
        // The sample is always the LATEST occurrence. If a bug is still happening, the most recent
        // stack is the one taken against the code currently deployed.
        message: input.message,
        stack: input.stack,
        scope: input.scope,
        lastPath: input.path,
        lastRelease: input.release,
        lastUserAgent: input.userAgent,
        lastSeenAt: nowIso,
        firstSeenAt: (existing?.firstSeenAt as string | undefined) ?? nowIso,
        count: admin.firestore.FieldValue.increment(1),
        affectedUids,
        affectedUserCount: affectedUids.length,
        // A bug marked resolved that happens again is not resolved. Reopening it automatically is
        // the whole value of tracking status here rather than in someone's head.
        status: ((existing?.status as ErrorStatus | undefined) === 'ignored'
          ? 'ignored'
          : 'open') satisfies ErrorStatus,
      },
      { merge: true },
    );

    return 'stored' as const;
  });
}

/**
 * Record a failure that happened inside a serverless function.
 *
 * Client reports only ever see what the browser saw — "500 from /api/broker-connect" — which says
 * something broke but never what. This is the other half: the actual exception, from the actual
 * handler, with the scope that identifies which one.
 *
 * Deliberately swallows everything. A handler is calling this from a catch block on its way to
 * returning an error response; a logging failure must not become the thing the user sees.
 */
export async function recordServerError(
  scope: string,
  thrown: unknown,
  context: { uid?: string | null; path?: string } = {},
): Promise<void> {
  try {
    const normalized = normalizeError(thrown, 'server', scope);
    await recordErrorEvent({
      fingerprint: normalized.fingerprint,
      kind: 'server',
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
      scope,
      path: context.path ? safePath(context.path) : `/api/${scope}`,
      release: process.env.COMMIT_REF?.slice(0, 7) ?? 'unknown',
      userAgent: 'server',
      uid: context.uid ?? null,
    });
  } catch (err) {
    console.error('[errorReports] failed to record server error:', err);
  }
}

/** Fire-and-forget form for handlers that must not wait on a diagnostic. */
export function logServerError(
  scope: string,
  thrown: unknown,
  context: { uid?: string | null; path?: string } = {},
): void {
  void recordServerError(scope, thrown, context);
}

/**
 * The uid behind an Authorization header, or null.
 *
 * Reports are accepted without one on purpose — a crash on the landing page is worth seeing — so a
 * bad or expired token means "anonymous", never a rejected report. The token is verified rather
 * than trusted because an attributed uid that anyone can claim is worse than no uid at all: it
 * would put one user's name on another user's crash.
 */
export async function uidFromAuthHeader(header: string | undefined): Promise<string | null> {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}
