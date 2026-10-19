import type { IncomingHttpHeaders } from 'http';
import { AdminRequestError, assertCallerIsAdmin, getBearerToken } from './adminAuth';
import { adminEmailFor, logAdminActionServer } from './adminAudit';
import { applyCreemEvent } from './creemApply';
import { parseBillingEvent, type CreemWebhookEvent } from './creemClient';
import { noteBillingEvent, readBillingEvent, readRecentBillingEvents, type BillingEventRecord } from './creemEventLog';
import { readEmailsTo, readRecentEmails, type EmailLogEntry } from './emailLog';
import { readLatestJobRuns } from './jobRuns';
import { isMailConfigured } from './mailer';
import { readSyncFeed, type SyncFeedRow } from './syncFeed';
import { readTrialProductCheck, type TrialPlanCheck } from './trialProductCheck';
import { JOBS, type JobRun, type JobSpec } from '../src/utils/jobSchedule';

/**
 * The Ops tab's data: what the server has been doing with nobody watching.
 *
 * Scheduled job runs, every sync across every user, every email, every billing webhook — four
 * records the server now keeps (jobRuns.ts, syncFeed.ts, emailLog.ts, creemEventLog.ts) and this
 * is the one place they are read back. Admin-only, like admin-stats; one function rather than four
 * so the tab loads with one round trip.
 */
export type AdminOpsAction = 'read' | 'userEmails' | 'replayWebhook';

export interface AdminOpsRequestBody {
  action?: AdminOpsAction;
  /** userEmails: the address to list sends to. */
  email?: unknown;
  /** replayWebhook: the Creem event id. */
  eventId?: unknown;
}

export interface AdminOpsReport {
  jobs: { spec: JobSpec; last: JobRun | null }[];
  syncFeed: SyncFeedRow[];
  billingEvents: BillingEventRecord[];
  emails: EmailLogEntry[];
  mailConfigured: boolean;
  /**
   * Each plan's Creem products against what the site promises about the free trial: null when
   * payments are not configured. See trialProductCheck.ts.
   */
  trialProducts: TrialPlanCheck[] | null;
  generatedAt: string;
}

export async function readOpsReport(): Promise<AdminOpsReport> {
  const [runs, syncFeed, billingEvents, emails, trialProducts] = await Promise.all([
    readLatestJobRuns(),
    readSyncFeed(),
    readRecentBillingEvents(),
    readRecentEmails(),
    // Never fails the tab: a product Creem would not return is named as a problem inside the check.
    readTrialProductCheck().catch(() => null),
  ]);
  return {
    jobs: JOBS.map((spec, i) => ({ spec, last: runs[i] ?? null })),
    syncFeed,
    billingEvents,
    emails,
    mailConfigured: isMailConfigured(),
    trialProducts,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Runs a stored Creem event through the entitlement logic again.
 *
 * For the plan that never arrived: the webhook failed, Creem's retries gave up, and the customer
 * wrote in. Everything applyCreemEvent does is idempotent, and the one thing that is not — the
 * payment-failed or cancelled email — is skipped on a replay, because the customer was told the
 * first time. Audited from here, like impersonation, because it changes a customer's plan.
 */
export async function replayBillingEvent(eventId: string, adminUid: string): Promise<{ applied: boolean; reason: string | null }> {
  const record = await readBillingEvent(eventId);
  if (!record) throw new AdminRequestError('No event with that id.', 404);
  if (!record.payload) throw new AdminRequestError('That event was received before payloads were kept, so there is nothing to replay.', 409);

  let payload: CreemWebhookEvent;
  try {
    payload = JSON.parse(record.payload) as CreemWebhookEvent;
  } catch {
    throw new AdminRequestError('The stored payload is not readable.', 409);
  }
  const parsed = parseBillingEvent(payload);
  if (!parsed) throw new AdminRequestError('That event carries nothing to apply — no uid, or a type the app does not act on.', 409);

  const result = await applyCreemEvent(payload, parsed, eventId, { notify: false });
  await noteBillingEvent(eventId, {
    outcome: result.applied ? 'replayed' : 'skipped',
    reason: result.reason ?? null,
    replays: (record.replays ?? 0) + 1,
    lastReplayAt: new Date().toISOString(),
  });
  await logAdminActionServer({
    adminUid,
    adminEmail: await adminEmailFor(adminUid),
    action: 'billing.event-replayed',
    targetType: 'billing-event',
    targetId: eventId,
    targetLabel: `${record.eventType ?? 'event'} for ${record.uid ?? 'unknown uid'}`,
    detail: result.applied
      ? `Replayed and applied: ${parsed.tier} / ${parsed.status}.`
      : `Replayed, not applied${result.reason ? `: ${result.reason}` : ''}.`,
  });
  return { applied: result.applied, reason: result.reason ?? null };
}

export async function handleAdminOpsRequest(
  headers: IncomingHttpHeaders,
  body: AdminOpsRequestBody,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const token = getBearerToken(headers);
  if (!token) return { statusCode: 401, body: { error: 'Missing authorization' } };

  try {
    const callerUid = await assertCallerIsAdmin(token);
    const action = body.action ?? 'read';

    switch (action) {
      case 'read':
        return { statusCode: 200, body: { ok: true, ...(await readOpsReport()) } };
      case 'userEmails': {
        const email = typeof body.email === 'string' ? body.email : '';
        if (!email) return { statusCode: 400, body: { error: 'email is required' } };
        return { statusCode: 200, body: { ok: true, emails: await readEmailsTo(email) } };
      }
      case 'replayWebhook': {
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) return { statusCode: 400, body: { error: 'eventId is required' } };
        const result = await replayBillingEvent(eventId, callerUid);
        return {
          statusCode: 200,
          body: {
            ok: true,
            ...result,
            message: result.applied ? 'Replayed. The plan has been applied.' : `Replayed, nothing changed${result.reason ? `: ${result.reason}` : ''}.`,
          },
        };
      }
      default:
        return { statusCode: 400, body: { error: 'Unknown action' } };
    }
  } catch (err) {
    if (err instanceof AdminRequestError) return { statusCode: err.statusCode, body: { error: err.message } };
    const message = err instanceof Error ? err.message : 'Request failed';
    if (message.includes('not configured')) return { statusCode: 503, body: { error: message } };
    return { statusCode: 500, body: { error: message } };
  }
}
