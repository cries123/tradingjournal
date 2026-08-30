import { addDoc, collection, getDocs, limit as fbLimit, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export type AdminAuditAction =
  | 'user.email-changed'
  | 'user.password-changed'
  | 'user.password-reset-sent'
  | 'user.deleted'
  | 'user.tier-granted'
  | 'user.tier-grant-cleared'
  | 'user.note-saved'
  | 'user.flagged'
  | 'user.unflagged'
  | 'bug.status-changed'
  | 'bug.priority-changed'
  | 'bug.note-saved'
  | 'broker-request.status-changed'
  | 'broker-request.priority-changed'
  | 'broker-request.note-saved'
  | 'help-article.created'
  | 'help-article.updated'
  | 'help-article.published'
  | 'help-article.unpublished'
  | 'help-article.deleted'
  | 'announcement.published';

export interface AdminAuditEntry {
  id: string;
  at: string;
  adminUid: string;
  adminEmail: string;
  action: AdminAuditAction;
  targetType: 'user' | 'bug-report' | 'broker-request' | 'help-article' | 'announcement';
  targetId: string;
  targetLabel: string;
  detail: string;
}

export type SubmitAdminAuditEntry = Omit<AdminAuditEntry, 'id' | 'at'>;

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
