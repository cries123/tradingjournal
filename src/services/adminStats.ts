import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

export interface BrokerInstitutionCount {
  name: string;
  users: number;
}

export interface AdminServerStats {
  authUserCount: number;
  firestoreUserCount: number;
  usernameRegistryCount: number;
  authSignupsLast7Days: number;
  authActiveLast7Days: number;
  authUsersMissingProfile: number;
  authSignupsLast24Hours: number;
  authSignupsLast30Days: number;
  authSignupsLast90Days: number;
  authNeverSignedIn: number;
  authActiveLast30Days: number;
  signupsByDay: { date: string; count: number }[];
  brokerRegisteredCount: number;
  brokerConnectedCount: number;
  brokerAccountCount: number;
  brokerAbandonedCount: number;
  brokerInstitutions: BrokerInstitutionCount[];
  brokerStatsPartial: boolean;
  /** Per-user connection state. Only users who ever started the connect flow appear here. */
  brokerUsers: AdminBrokerUser[];
}

export interface AdminBrokerUser {
  uid: string;
  connected: boolean;
  accountCount: number;
  institutions: string[];
}

export interface AdminServerStatsResult {
  stats: AdminServerStats | null;
  error: string | null;
}

export async function fetchAdminServerStats(): Promise<AdminServerStatsResult> {
  if (!isFirebaseConfigured()) {
    return { stats: null, error: null };
  }

  const user = getFirebaseAuth().currentUser;
  if (!user) {
    return { stats: null, error: 'Sign in required' };
  }

  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/admin-stats', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await res.json()) as AdminServerStats & { ok?: boolean; error?: string };
    if (!res.ok) {
      const message = data.error ?? `HTTP ${res.status}`;
      if (res.status === 503) {
        return {
          stats: null,
          error: 'Auth stats unavailable — set FIREBASE_SERVICE_ACCOUNT_JSON on Netlify',
        };
      }
      return { stats: null, error: message };
    }

    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

    return {
      stats: {
        authUserCount: num(data.authUserCount),
        firestoreUserCount: num(data.firestoreUserCount),
        usernameRegistryCount: num(data.usernameRegistryCount),
        authSignupsLast7Days: num(data.authSignupsLast7Days),
        authActiveLast7Days: num(data.authActiveLast7Days),
        authUsersMissingProfile: num(data.authUsersMissingProfile),
        authSignupsLast24Hours: num(data.authSignupsLast24Hours),
        authSignupsLast30Days: num(data.authSignupsLast30Days),
        authSignupsLast90Days: num(data.authSignupsLast90Days),
        authNeverSignedIn: num(data.authNeverSignedIn),
        authActiveLast30Days: num(data.authActiveLast30Days),
        // An older deploy of the function won't send these; an empty list renders as "no data"
        // rather than crashing the panel.
        signupsByDay: Array.isArray(data.signupsByDay) ? data.signupsByDay : [],
        brokerRegisteredCount: num(data.brokerRegisteredCount),
        brokerConnectedCount: num(data.brokerConnectedCount),
        brokerAccountCount: num(data.brokerAccountCount),
        brokerAbandonedCount: num(data.brokerAbandonedCount),
        brokerInstitutions: Array.isArray(data.brokerInstitutions) ? data.brokerInstitutions : [],
        brokerStatsPartial: data.brokerStatsPartial === true,
        // An older deploy of the function won't send this. An empty list means the Users tab shows
        // "unknown" rather than confidently claiming nobody is connected.
        brokerUsers: Array.isArray(data.brokerUsers)
          ? (data.brokerUsers as AdminBrokerUser[]).filter(
              (u) => u && typeof u.uid === 'string',
            )
          : [],
      },
      error: null,
    };
  } catch {
    return { stats: null, error: 'Could not load Auth user stats' };
  }
}
