import type { IncomingHttpHeaders } from 'http';
import { AdminRequestError, assertCallerIsAdmin, getBearerToken } from './adminAuth';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';

export interface BrokerInstitutionCount {
  name: string;
  users: number;
}

export interface AdminStatsResponse {
  authUserCount: number;
  firestoreUserCount: number;
  usernameRegistryCount: number;
  authSignupsLast7Days: number;
  authActiveLast7Days: number;
  authUsersMissingProfile: number;
  /** Signups in the trailing 24h / 30d / 90d, from Auth account creation times. */
  authSignupsLast24Hours: number;
  authSignupsLast30Days: number;
  authSignupsLast90Days: number;
  /** Accounts that have never signed in since being created. */
  authNeverSignedIn: number;
  authActiveLast30Days: number;
  /** Signups per day for the last 30 days, oldest first. */
  signupsByDay: { date: string; count: number }[];
  /** Started the SnapTrade flow at least once (has credentials issued). */
  brokerRegisteredCount: number;
  /** Currently has at least one linked brokerage account. */
  brokerConnectedCount: number;
  /** Total linked accounts across all users — someone can link more than one. */
  brokerAccountCount: number;
  /** Registered with SnapTrade but never completed a link. */
  brokerAbandonedCount: number;
  brokerInstitutions: BrokerInstitutionCount[];
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

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const dayAgoMs = now - DAY_MS;
    const weekAgoMs = now - 7 * DAY_MS;
    const monthAgoMs = now - 30 * DAY_MS;
    const quarterAgoMs = now - 90 * DAY_MS;
    const auth = getAdminAuth();
    const db = getAdminFirestore();

    let authUserCount = 0;
    let authSignupsLast24Hours = 0;
    let authSignupsLast7Days = 0;
    let authSignupsLast30Days = 0;
    let authSignupsLast90Days = 0;
    let authActiveLast7Days = 0;
    let authActiveLast30Days = 0;
    let authNeverSignedIn = 0;
    const authUids = new Set<string>();
    const signupsByDayMap = new Map<string, number>();
    let pageToken: string | undefined;

    // Seed every day in the window so gaps render as zero rather than disappearing from the chart.
    for (let i = 29; i >= 0; i--) {
      signupsByDayMap.set(new Date(now - i * DAY_MS).toISOString().slice(0, 10), 0);
    }

    do {
      const result = await auth.listUsers(1000, pageToken);
      for (const record of result.users) {
        authUserCount++;
        authUids.add(record.uid);

        const createdMs = record.metadata.creationTime
          ? Date.parse(record.metadata.creationTime)
          : NaN;
        if (!Number.isNaN(createdMs)) {
          if (createdMs >= dayAgoMs) authSignupsLast24Hours++;
          if (createdMs >= weekAgoMs) authSignupsLast7Days++;
          if (createdMs >= monthAgoMs) {
            authSignupsLast30Days++;
            const key = new Date(createdMs).toISOString().slice(0, 10);
            if (signupsByDayMap.has(key)) {
              signupsByDayMap.set(key, (signupsByDayMap.get(key) ?? 0) + 1);
            }
          }
          if (createdMs >= quarterAgoMs) authSignupsLast90Days++;
        }

        const lastSignInMs = record.metadata.lastSignInTime
          ? Date.parse(record.metadata.lastSignInTime)
          : NaN;
        if (Number.isNaN(lastSignInMs)) {
          authNeverSignedIn++;
        } else {
          if (lastSignInMs >= weekAgoMs) authActiveLast7Days++;
          if (lastSignInMs >= monthAgoMs) authActiveLast30Days++;
        }
      }
      pageToken = result.pageToken;
    } while (pageToken);

    const [firestoreUserCountSnap, usernameCountSnap, firestoreUsersSnap, brokerSnap] =
      await Promise.all([
        db.collection('users').count().get(),
        db.collection('usernames').count().get(),
        db.collection('users').select().get(),
        // Written by the broker-connect function whenever it learns a user's real link state.
        // Small (one doc per user who has ever opened the broker flow), so a full read is fine.
        db.collection('brokerConnections').get(),
      ]);

    const firestoreUids = new Set(firestoreUsersSnap.docs.map((doc) => doc.id));
    let authUsersMissingProfile = 0;
    for (const uid of authUids) {
      if (!firestoreUids.has(uid)) authUsersMissingProfile++;
    }

    let brokerConnectedCount = 0;
    let brokerAccountCount = 0;
    const institutionUsers = new Map<string, number>();

    for (const docSnap of brokerSnap.docs) {
      const data = docSnap.data() as {
        connected?: boolean;
        accountCount?: number;
        institutions?: string[];
      };
      if (!data.connected) continue;

      brokerConnectedCount++;
      brokerAccountCount += data.accountCount ?? 0;
      // Counted once per user per institution, so a user with two Schwab accounts is one Schwab
      // user rather than two.
      for (const name of new Set(data.institutions ?? [])) {
        institutionUsers.set(name, (institutionUsers.get(name) ?? 0) + 1);
      }
    }

    const brokerInstitutions: BrokerInstitutionCount[] = [...institutionUsers.entries()]
      .map(([name, users]) => ({ name, users }))
      .sort((a, b) => b.users - a.users);

    const stats: AdminStatsResponse = {
      authUserCount,
      firestoreUserCount: firestoreUserCountSnap.data().count,
      usernameRegistryCount: usernameCountSnap.data().count,
      authSignupsLast7Days,
      authActiveLast7Days,
      authUsersMissingProfile,
      authSignupsLast24Hours,
      authSignupsLast30Days,
      authSignupsLast90Days,
      authNeverSignedIn,
      authActiveLast30Days,
      signupsByDay: [...signupsByDayMap.entries()].map(([date, count]) => ({ date, count })),
      brokerRegisteredCount: brokerSnap.size,
      brokerConnectedCount,
      brokerAccountCount,
      brokerAbandonedCount: Math.max(0, brokerSnap.size - brokerConnectedCount),
      brokerInstitutions,
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
