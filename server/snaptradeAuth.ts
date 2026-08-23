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

  // getAdminAuth() throws synchronously if FIREBASE_SERVICE_ACCOUNT_JSON is missing/malformed on the
  // server. That's a server misconfiguration, not a bad session — keep it out of the generic
  // "invalid session" catch below so the real cause shows up in the response and the function logs
  // instead of being misreported as an expired login.
  let auth: ReturnType<typeof getAdminAuth>;
  try {
    auth = getAdminAuth();
  } catch (err) {
    console.error('[broker-connect] Firebase Admin is not configured:', err instanceof Error ? err.message : err);
    throw new BrokerRequestError(
      'Broker connect needs Firebase Admin configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON). Ask the site owner to set that up.',
      503,
    );
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    console.error('[broker-connect] verifyIdToken failed:', err instanceof Error ? err.message : err);
    throw new BrokerRequestError('Invalid or expired session. Sign out and back in, then try again.', 401);
  }
}
