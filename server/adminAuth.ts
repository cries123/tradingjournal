import type { IncomingHttpHeaders } from 'http';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';

export class AdminRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AdminRequestError';
    this.statusCode = statusCode;
  }
}

export function getBearerToken(headers: IncomingHttpHeaders): string | null {
  const auth = headers.authorization ?? headers.Authorization;
  if (!auth || typeof auth !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1] ?? null;
}

export async function assertCallerIsAdmin(idToken: string): Promise<string> {
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const adminSnap = await getAdminFirestore().doc('config/admin').get();
  if (!adminSnap.exists) {
    throw new AdminRequestError('Admin is not configured', 403);
  }
  const adminUid = (adminSnap.data() as { uid?: string }).uid;
  if (adminUid !== decoded.uid) {
    throw new AdminRequestError('Forbidden', 403);
  }
  return decoded.uid;
}
