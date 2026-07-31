import type { IncomingHttpHeaders } from 'http';
import { AdminRequestError, assertCallerIsAdmin, getBearerToken } from './adminAuth';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';

export interface AdminStatsResponse {
  authUserCount: number;
  firestoreUserCount: number;
  usernameRegistryCount: number;
  authSignupsLast7Days: number;
  authActiveLast7Days: number;
  authUsersMissingProfile: number;
}

export async function handleAdminStatsRequest(
  headers: IncomingHttpHeaders,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const token = getBearerToken(headers);
  if (!token) {
    return { statusCode: 401, body: { error: 'Missing authorization' } };
  }

  try {
    await assertCallerIsAdmin(token);

    const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const auth = getAdminAuth();
    const db = getAdminFirestore();

    let authUserCount = 0;
    let authSignupsLast7Days = 0;
    let authActiveLast7Days = 0;
    const authUids = new Set<string>();
    let pageToken: string | undefined;

    do {
      const result = await auth.listUsers(1000, pageToken);
      for (const record of result.users) {
        authUserCount++;
        authUids.add(record.uid);

        const createdMs = record.metadata.creationTime
          ? Date.parse(record.metadata.creationTime)
          : NaN;
        if (!Number.isNaN(createdMs) && createdMs >= weekAgoMs) {
          authSignupsLast7Days++;
        }

        const lastSignInMs = record.metadata.lastSignInTime
          ? Date.parse(record.metadata.lastSignInTime)
          : NaN;
        if (!Number.isNaN(lastSignInMs) && lastSignInMs >= weekAgoMs) {
          authActiveLast7Days++;
        }
      }
      pageToken = result.pageToken;
    } while (pageToken);

    const [firestoreUserCountSnap, usernameCountSnap, firestoreUsersSnap] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('usernames').count().get(),
      db.collection('users').select().get(),
    ]);

    const firestoreUids = new Set(firestoreUsersSnap.docs.map((doc) => doc.id));
    let authUsersMissingProfile = 0;
    for (const uid of authUids) {
      if (!firestoreUids.has(uid)) authUsersMissingProfile++;
    }

    const stats: AdminStatsResponse = {
      authUserCount,
      firestoreUserCount: firestoreUserCountSnap.data().count,
      usernameRegistryCount: usernameCountSnap.data().count,
      authSignupsLast7Days,
      authActiveLast7Days,
      authUsersMissingProfile,
    };

    return { statusCode: 200, body: { ok: true, ...stats } };
  } catch (err) {
    if (err instanceof AdminRequestError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }
    const message = err instanceof Error ? err.message : 'Request failed';
    if (message.includes('not configured')) {
      return { statusCode: 503, body: { error: message } };
    }
    return { statusCode: 500, body: { error: message } };
  }
}
