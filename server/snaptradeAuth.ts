import type { IncomingHttpHeaders } from 'http';
import { getBearerToken } from './adminAuth';
import { getAdminAuth } from './firebaseAdmin';

export class BrokerRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'BrokerRequestError';
    this.statusCode = statusCode;
  }
}

/** Verifies the caller's Firebase ID token and returns their uid. Any signed-in user, not just admins. */
export async function assertCallerUid(headers: IncomingHttpHeaders): Promise<string> {
  const token = getBearerToken(headers);
  if (!token) {
    throw new BrokerRequestError('Sign in required', 401);
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    throw new BrokerRequestError('Invalid or expired session', 401);
  }
}
