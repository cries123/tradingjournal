import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

export interface AdminServerStats {
  authUserCount: number;
  firestoreUserCount: number;
  usernameRegistryCount: number;
  authSignupsLast7Days: number;
  authActiveLast7Days: number;
  authUsersMissingProfile: number;
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

    return {
      stats: {
        authUserCount: data.authUserCount,
        firestoreUserCount: data.firestoreUserCount,
        usernameRegistryCount: data.usernameRegistryCount,
        authSignupsLast7Days: data.authSignupsLast7Days,
        authActiveLast7Days: data.authActiveLast7Days,
        authUsersMissingProfile: data.authUsersMissingProfile,
      },
      error: null,
    };
  } catch {
    return { stats: null, error: 'Could not load Auth user stats' };
  }
}
