import type { AdminOpsReport } from '../../server/adminOpsHandler';
import type { EmailLogEntry } from '../../server/emailLog';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

export type { AdminOpsReport, EmailLogEntry };

/**
 * The Ops tab's records, from the admin-ops function. Null stats with an error when it could not
 * be read, the same shape as the server stats, so the tab can say what went wrong.
 */
export interface AdminOpsResult {
  report: AdminOpsReport | null;
  error: string | null;
}

async function opsPost<T>(body: Record<string, unknown>): Promise<T> {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in required');

  const res = await fetch('/api/admin-ops', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export async function fetchAdminOps(): Promise<AdminOpsResult> {
  try {
    const report = await opsPost<AdminOpsReport>({ action: 'read' });
    return { report, error: null };
  } catch (err) {
    return { report: null, error: err instanceof Error ? err.message : 'Could not load the Ops records' };
  }
}

/** Everything sent to one address, newest first. Empty on failure: the card says so itself. */
export async function fetchUserEmails(email: string): Promise<EmailLogEntry[]> {
  const { emails } = await opsPost<{ emails: EmailLogEntry[] }>({ action: 'userEmails', email });
  return emails ?? [];
}

export async function replayBillingEvent(eventId: string): Promise<{ applied: boolean; message: string }> {
  return opsPost<{ applied: boolean; message: string }>({ action: 'replayWebhook', eventId });
}
