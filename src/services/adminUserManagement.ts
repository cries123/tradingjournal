import { sendPasswordResetEmail } from 'firebase/auth';
import type { AdminUserAction } from '../../server/adminUserHandler';
import { deleteUserViaFirestore } from './adminDeleteUserClient';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

async function adminApiPost(payload: {
  action: AdminUserAction;
  targetUid: string;
  email?: string;
  password?: string;
}): Promise<{ ok: true; message: string }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }

  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new Error('Sign in required');
  }

  const token = await user.getIdToken();
  const res = await fetch('/api/admin-user', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? 'Request failed');
  }

  return { ok: true, message: data.message ?? 'Done' };
}

/** Sends Firebase's standard password reset email to the user. */
export async function adminSendPasswordResetEmail(email: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error('No email on file for this user');
  }
  await sendPasswordResetEmail(getFirebaseAuth(), trimmed);
}

export async function adminUpdateUserEmail(
  targetUid: string,
  email: string,
): Promise<{ message: string }> {
  return adminApiPost({ action: 'updateEmail', targetUid, email });
}

export async function adminUpdateUserPassword(
  targetUid: string,
  password: string,
): Promise<{ message: string }> {
  return adminApiPost({ action: 'updatePassword', targetUid, password });
}

export async function adminDeleteUser(targetUid: string): Promise<{ message: string }> {
  try {
    return await adminApiPost({ action: 'deleteUser', targetUid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('not configured') || msg.includes('503')) {
      return deleteUserViaFirestore(targetUid);
    }
    throw err;
  }
}
