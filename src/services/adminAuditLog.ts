import { addDoc, collection, getDocs, limit as fbLimit, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export type AdminAuditAction =
  | 'user.email-changed'
  | 'user.password-changed'
  | 'user.password-reset-sent'
  | 'user.deleted'
  | 'user.tier-granted'
  | 'user.tier-grant-cleared'
  | 'user.access-extended'
  | 'user.access-extension-ended'
  | 'user.usage-reset'
  | 'user.credits-adjusted'
  | 'user.suspended'
  | 'user.reactivated'
  | 'user.broker-link-reset'
  | 'user.emailed'
  | 'user.note-saved'
  | 'user.flagged'
  | 'user.unflagged'
  | 'bug.status-changed'
  | 'bug.priority-changed'
  | 'bug.note-saved'
  | 'broker-request.status-changed'
  | 'broker-request.priority-changed'
  | 'broker-request.note-saved'
  | 'ticket.status-changed'
  | 'ticket.priority-changed'
  | 'ticket.note-saved'
  | 'error.status-changed'
  | 'help-article.created'
  | 'help-article.updated'
  | 'help-article.published'
  | 'help-article.unpublished'
  | 'help-article.deleted'
  | 'announcement.published'
  | 'checkout.toggled';

export interface AdminAuditEntry {
  id: string;
  at: string;
  adminUid: string;
  adminEmail: string;
  action: AdminAuditAction;
  targetType:
    | 'user'
    | 'bug-report'
    | 'broker-request'
    | 'support-ticket'
    | 'error-event'
    | 'help-article'
    | 'announcement'
    | 'checkout';
  targetId: string;
  targetLabel: string;
  detail: string;
}

export type SubmitAdminAuditEntry = Omit<AdminAuditEntry, 'id' | 'at'>;

/** How each action reads in a sentence, followed by the target: "Granted a plan to @jay". */
export const AUDIT_ACTION_LABELS: Record<AdminAuditAction, string> = {
  'user.email-changed': 'Changed email for',
  'user.password-changed': 'Set a new password for',
  'user.password-reset-sent': 'Sent password reset to',
  'user.deleted': 'Deleted user',
  'announcement.published': 'Updated the site announcement',
  'checkout.toggled': 'Changed plan checkout availability',
  'user.tier-granted': 'Granted a plan to',
  'user.tier-grant-cleared': 'Removed the granted plan from',
  'user.access-extended': 'Extended access for',
  'user.access-extension-ended': 'Ended complimentary access for',
  'user.usage-reset': "Gave back today's allowance to",
  'user.credits-adjusted': 'Adjusted bonus credits for',
  'user.suspended': 'Suspended sign-in for',
  'user.reactivated': 'Restored sign-in for',
  'user.broker-link-reset': 'Reset the broker link for',
  'user.emailed': 'Emailed',
  'user.note-saved': 'Updated internal note for',
  'user.flagged': 'Flagged',
  'user.unflagged': 'Unflagged',
  'bug.status-changed': 'Updated status on bug report',
  'bug.priority-changed': 'Changed priority on bug report',
  'bug.note-saved': 'Added a note to bug report',
  'broker-request.status-changed': 'Updated status on broker request',
  'broker-request.priority-changed': 'Changed priority on broker request',
  'broker-request.note-saved': 'Added a note to broker request',
  'ticket.status-changed': 'Updated status on support ticket',
  'ticket.priority-changed': 'Changed priority on support ticket',
  'ticket.note-saved': 'Added a note to support ticket',
  'error.status-changed': 'Updated status on production error',
  'help-article.created': 'Created help article',
  'help-article.updated': 'Edited help article',
  'help-article.published': 'Published help article',
  'help-article.unpublished': 'Unpublished help article',
  'help-article.deleted': 'Deleted help article',
};

/** Fire-and-forget: an audit log write failing should never block the admin action it describes. */
export async function logAdminAction(entry: SubmitAdminAuditEntry): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await addDoc(collection(getFirebaseDb(), 'adminAuditLog'), {
      ...entry,
      at: new Date().toISOString(),
    });
  } catch {
    // Non-critical — the underlying action already succeeded or failed on its own.
  }
}

export async function fetchRecentAuditLog(max = 30): Promise<AdminAuditEntry[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const q = query(collection(getFirebaseDb(), 'adminAuditLog'), orderBy('at', 'desc'), fbLimit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminAuditEntry, 'id'>) }));
  } catch {
    return [];
  }
}

/**
 * Everything ever done to one account, newest first.
 *
 * Filtered server-side on the target and sorted here: a where + orderBy on different fields needs
 * a composite index, and one person's trail is short enough that sorting it in the browser costs
 * nothing and needs nothing deployed.
 */
export async function fetchAuditLogForUser(uid: string, max = 100): Promise<AdminAuditEntry[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const q = query(
      collection(getFirebaseDb(), 'adminAuditLog'),
      where('targetType', '==', 'user'),
      where('targetId', '==', uid),
      fbLimit(max),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<AdminAuditEntry, 'id'>) }))
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}
