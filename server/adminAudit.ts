import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import type { SubmitAdminAuditEntry } from '../src/services/adminAuditLog';

/**
 * Writing an audit entry from the server, for the one action the browser cannot record.
 *
 * Every other admin action logs itself from the client, which is fine: the admin is still signed in
 * as themselves afterwards, so the write goes through their own session. Impersonation is the
 * exception, and it is the exception in the worst direction — the moment the custom token lands, the
 * tab IS the customer, the admin's own session is gone, and there is no longer any session that could
 * write an entry attributing what happens next to an admin.
 *
 * So impersonation was the single most sensitive action in the panel and the only one leaving no
 * trace. It hands over full read and write access to somebody's account: Firestore sees their uid,
 * every write lands in their history, and afterwards nothing distinguished it from the customer doing
 * it themselves. Logged here, before the token is minted, it cannot be skipped by a browser that
 * navigated away.
 *
 * Same collection and same document shape as the client writer, so the existing panel renders these
 * without knowing the difference — the type is imported to keep that true.
 */
export async function logAdminActionServer(entry: SubmitAdminAuditEntry): Promise<void> {
  try {
    await getAdminFirestore()
      .collection('adminAuditLog')
      .add({ ...entry, at: new Date().toISOString() });
  } catch (err) {
    /*
     * Never fails the action it describes.
     *
     * A refused audit write must not stop support getting into an account to fix something, and the
     * same choice is already made by the client writer. It is logged loudly instead, because an audit
     * trail with silent gaps is worse than one that is known to be patchy.
     */
    console.error('[admin-audit] could not record an admin action:', err);
  }
}

/** The admin's own address, for the entry. Falls back to the uid rather than failing the write. */
export async function adminEmailFor(uid: string): Promise<string> {
  try {
    return (await getAdminAuth().getUser(uid)).email ?? uid;
  } catch {
    return uid;
  }
}
