import { addDoc, collection, getDocs, limit as fbLimit, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export type AdminAuditAction =
  | 'user.email-changed'
  | 'user.password-changed'
  | 'user.password-reset-sent'
  | 'user.deleted'
  /**
   * Signed in as a customer.
   *
   * Written by the SERVER (see server/adminAudit.ts), unlike every other action here. The browser
   * cannot record it: the moment the custom token lands the tab is the customer and the admin's own
   * session is gone, so there is no session left to write with. That is also why it was the one
   * action in the panel leaving no trace at all, while handing over full write access to an account.
   */
  | 'user.impersonated'
  /** Logged by the server, like impersonation: it rewrites a record the customer reads. */
  | 'user.sync-history-deleted'
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
  | 'user.support-message-sent'
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
  | 'checkout.toggled'
  /** Logged by the server: a stored Creem event run through the entitlement logic again. */
  | 'billing.event-replayed'
  /** Logged by the server when the recipient list is fixed and an email to everybody starts going out. */
  | 'email.broadcast-sent'
  | 'email.broadcast-test';

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
    | 'checkout'
    | 'billing-event'
    | 'broadcast';
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
  'user.impersonated': 'Signed in as',
  'user.sync-history-deleted': 'Deleted sync history rows for',
  'announcement.published': 'Updated the site announcement',
  'checkout.toggled': 'Changed plan checkout availability',
  'billing.event-replayed': 'Replayed billing event',
  'email.broadcast-sent': 'Sent an email to',
  'email.broadcast-test': 'Sent themselves a test of',
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
  'user.support-message-sent': 'Sent a support message to',
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
