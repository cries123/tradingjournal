import type { IncomingHttpHeaders } from 'http';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';

export type AdminUserAction = 'updateEmail' | 'updatePassword' | 'deleteUser';

export interface AdminUserRequestBody {
  action: AdminUserAction;
  targetUid: string;
  email?: string;
  password?: string;
}

function getBearerToken(headers: IncomingHttpHeaders): string | null {
  const auth = headers.authorization ?? headers.Authorization;
  if (!auth || typeof auth !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1] ?? null;
}

async function assertCallerIsAdmin(idToken: string): Promise<string> {
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const adminSnap = await getAdminFirestore().doc('config/admin').get();
  if (!adminSnap.exists) {
    throw new AdminUserError('Admin is not configured', 403);
  }
  const adminUid = (adminSnap.data() as { uid?: string }).uid;
  if (adminUid !== decoded.uid) {
    throw new AdminUserError('Forbidden', 403);
  }
  return decoded.uid;
}

class AdminUserError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AdminUserError';
    this.statusCode = statusCode;
  }
}

async function deleteCollectionDocs(collectionPath: string): Promise<number> {
  const db = getAdminFirestore();
  let deleted = 0;

  while (true) {
    const snap = await db.collection(collectionPath).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
  }

  return deleted;
}

async function deleteUserFirestoreData(uid: string): Promise<void> {
  const db = getAdminFirestore();

  await deleteCollectionDocs(`users/${uid}/trades`);
  await deleteCollectionDocs(`users/${uid}/settings`);
  await deleteCollectionDocs(`users/${uid}/dayNotes`);

  const usernames = await db.collection('usernames').where('uid', '==', uid).get();
  if (!usernames.empty) {
    const batch = db.batch();
    usernames.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  const shares = await db.collection('coachShares').where('ownerUid', '==', uid).get();
  if (!shares.empty) {
    const batch = db.batch();
    shares.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  await db.doc(`users/${uid}`).delete().catch(() => undefined);
}

async function handleUpdateEmail(targetUid: string, email: string): Promise<{ message: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new AdminUserError('Invalid email address', 400);
  }

  await getAdminAuth().updateUser(targetUid, { email: trimmed, emailVerified: false });
  await getAdminFirestore().doc(`users/${targetUid}`).set({ email: trimmed }, { merge: true });

  return { message: `Email updated to ${trimmed}` };
}

async function handleUpdatePassword(targetUid: string, password: string): Promise<{ message: string }> {
  if (password.length < 6) {
    throw new AdminUserError('Password must be at least 6 characters', 400);
  }

  await getAdminAuth().updateUser(targetUid, { password });
  return { message: 'Password updated' };
}

async function handleDeleteUser(callerUid: string, targetUid: string): Promise<{ message: string }> {
  if (callerUid === targetUid) {
    throw new AdminUserError('You cannot delete your own account from here', 400);
  }

  const adminSnap = await getAdminFirestore().doc('config/admin').get();
  const siteAdminUid = (adminSnap.data() as { uid?: string } | undefined)?.uid;
  if (siteAdminUid && targetUid === siteAdminUid) {
    throw new AdminUserError('The site admin account cannot be deleted', 400);
  }

  await deleteUserFirestoreData(targetUid);

  try {
    await getAdminAuth().deleteUser(targetUid);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/user-not-found') {
      throw err;
    }
  }

  return { message: 'User deleted' };
}

export async function handleAdminUserRequest(
  headers: IncomingHttpHeaders,
  body: AdminUserRequestBody,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const token = getBearerToken(headers);
  if (!token) {
    return { statusCode: 401, body: { error: 'Missing authorization' } };
  }

  try {
    const callerUid = await assertCallerIsAdmin(token);
    const { action, targetUid, email, password } = body;

    if (!targetUid?.trim()) {
      return { statusCode: 400, body: { error: 'targetUid is required' } };
    }

    switch (action) {
      case 'updateEmail': {
        if (!email?.trim()) {
          return { statusCode: 400, body: { error: 'email is required' } };
        }
        const result = await handleUpdateEmail(targetUid, email);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'updatePassword': {
        if (!password) {
          return { statusCode: 400, body: { error: 'password is required' } };
        }
        const result = await handleUpdatePassword(targetUid, password);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'deleteUser': {
        const result = await handleDeleteUser(callerUid, targetUid);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      default:
        return { statusCode: 400, body: { error: 'Unknown action' } };
    }
  } catch (err) {
    if (err instanceof AdminUserError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }
    const message = err instanceof Error ? err.message : 'Request failed';
    if (message.includes('not configured')) {
      return { statusCode: 503, body: { error: message } };
    }
    return { statusCode: 500, body: { error: message } };
  }
}
