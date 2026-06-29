import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import type { BrokerSupportRequest } from './brokerSupportRequests';
import type { BugReport } from './bugReports';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface AdminConfig {
  uid: string;
  email: string;
  username?: string;
  claimedAt: string;
}

export type AdminAccessResult =
  | { ok: true; isNewClaim: boolean }
  | { ok: false; reason: 'not-configured' | 'denied' | 'not-signed-in' };

export async function getAdminConfig(): Promise<AdminConfig | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(doc(getFirebaseDb(), 'config', 'admin'));
  if (!snap.exists()) return null;
  return snap.data() as AdminConfig;
}

export async function isCurrentUserAdmin(uid: string): Promise<boolean> {
  const config = await getAdminConfig();
  return config?.uid === uid;
}

/** First signed-in user to visit admin claims the role; all others are denied. */
export async function claimOrVerifyAdmin(
  uid: string,
  email: string,
  username?: string | null,
): Promise<AdminAccessResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, reason: 'not-configured' };
  }
  if (!uid) {
    return { ok: false, reason: 'not-signed-in' };
  }

  const ref = doc(getFirebaseDb(), 'config', 'admin');

  return runTransaction(getFirebaseDb(), async (transaction) => {
    const snap = await transaction.get(ref);

    if (!snap.exists()) {
      transaction.set(ref, {
        uid,
        email,
        username: username ?? null,
        claimedAt: new Date().toISOString(),
      });
      return { ok: true as const, isNewClaim: true };
    }

    const data = snap.data() as AdminConfig;
    if (data.uid === uid) {
      return { ok: true as const, isNewClaim: false };
    }

    return { ok: false as const, reason: 'denied' as const };
  }) as Promise<AdminAccessResult>;
}

async function countCollection(name: string): Promise<number | null> {
  const db = getFirebaseDb();
  try {
    const snap = await getCountFromServer(collection(db, name));
    return snap.data().count;
  } catch {
    try {
      const docs = await getDocs(collection(db, name));
      return docs.size;
    } catch {
      return null;
    }
  }
}

export interface AdminUserSummary {
  uid: string;
  email: string;
  username: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  tradeCount: number;
  lastTradeDate: string | null;
  coachShareEnabled: boolean;
}

export interface AdminSignupStats {
  last7Days: number;
  thisMonth: number;
  dailyLast7: { date: string; label: string; count: number }[];
}

export type AdminActivityItem =
  | {
      type: 'signup';
      at: string;
      uid: string;
      username: string | null;
      email: string;
    }
  | {
      type: 'bug';
      at: string;
      id: string;
      email: string;
      preview: string;
      status: string;
    }
  | {
      type: 'broker';
      at: string;
      id: string;
      brokerName: string;
      email: string;
      status: string;
    };

export interface BrokerRequestSummary {
  name: string;
  count: number;
}

function firestoreTimestampToIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/** List registered accounts for the admin panel. */
export async function fetchSignedUpUsers(): Promise<AdminUserSummary[]> {
  if (!isFirebaseConfigured()) return [];

  const db = getFirebaseDb();
  const byUid = new Map<string, AdminUserSummary>();

  const [userSnaps, usernameSnaps] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'usernames')),
  ]);

  for (const docSnap of userSnaps.docs) {
    const data = docSnap.data() as {
      email?: string;
      username?: string;
      lastLoginAt?: unknown;
      createdAt?: unknown;
    };

    byUid.set(docSnap.id, {
      uid: docSnap.id,
      email: data.email?.trim() ?? '',
      username: data.username?.trim() || null,
      lastLoginAt: firestoreTimestampToIso(data.lastLoginAt),
      createdAt: firestoreTimestampToIso(data.createdAt),
      tradeCount: 0,
      lastTradeDate: null,
      coachShareEnabled: false,
    });
  }

  for (const docSnap of usernameSnaps.docs) {
    const data = docSnap.data() as { uid?: string; username?: string; createdAt?: unknown };
    const uid = data.uid?.trim();
    if (!uid) continue;

    const name = data.username?.trim() || docSnap.id;
    const existing = byUid.get(uid);
    if (existing) {
      if (!existing.username) existing.username = name;
    } else {
      byUid.set(uid, {
        uid,
        email: '',
        username: name,
        lastLoginAt: null,
        createdAt: firestoreTimestampToIso(data.createdAt),
        tradeCount: 0,
        lastTradeDate: null,
        coachShareEnabled: false,
      });
    }
  }

  const users = [...byUid.values()];
  await enrichUsersWithActivity(users);
  return users.sort((a, b) => {
    const aLabel = a.username ?? a.email ?? a.uid;
    const bLabel = b.username ?? b.email ?? b.uid;
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
  });
}

async function fetchUserTradeStats(
  uid: string,
): Promise<{ tradeCount: number; lastTradeDate: string | null }> {
  const db = getFirebaseDb();
  const tradesCol = collection(db, 'users', uid, 'trades');

  try {
    const countSnap = await getCountFromServer(tradesCol);
    const tradeCount = countSnap.data().count;
    if (tradeCount === 0) {
      return { tradeCount: 0, lastTradeDate: null };
    }

    const snap = await getDocs(tradesCol);
    let lastTradeDate: string | null = null;
    for (const tradeDoc of snap.docs) {
      const date = (tradeDoc.data() as { date?: string }).date;
      if (date && (!lastTradeDate || date > lastTradeDate)) {
        lastTradeDate = date;
      }
    }
    return { tradeCount, lastTradeDate };
  } catch {
    return { tradeCount: 0, lastTradeDate: null };
  }
}

async function fetchCoachShareEnabled(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'users', uid, 'settings', 'preferences'));
    if (!snap.exists()) return false;
    return Boolean((snap.data() as { coachShareEnabled?: boolean }).coachShareEnabled);
  } catch {
    return false;
  }
}

async function enrichUsersWithActivity(users: AdminUserSummary[]): Promise<void> {
  await Promise.all(
    users.map(async (user) => {
      const [tradeStats, coachShareEnabled] = await Promise.all([
        fetchUserTradeStats(user.uid),
        fetchCoachShareEnabled(user.uid),
      ]);
      user.tradeCount = tradeStats.tradeCount;
      user.lastTradeDate = tradeStats.lastTradeDate;
      user.coachShareEnabled = coachShareEnabled;
    }),
  );
}

export function computeSignupStats(users: AdminUserSummary[]): AdminSignupStats {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const dailyCounts = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    dailyCounts.set(d.toISOString().slice(0, 10), 0);
  }

  let last7Days = 0;
  let thisMonth = 0;

  for (const user of users) {
    if (!user.createdAt) continue;
    const created = new Date(user.createdAt);
    if (Number.isNaN(created.getTime())) continue;

    if (created >= weekAgo) {
      last7Days++;
      const key = created.toISOString().slice(0, 10);
      if (dailyCounts.has(key)) {
        dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
      }
    }

    if (created >= monthStart) {
      thisMonth++;
    }
  }

  const dailyLast7 = [...dailyCounts.entries()].map(([date, count]) => ({
    date,
    label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
    }),
    count,
  }));

  return { last7Days, thisMonth, dailyLast7 };
}

export function computeTopBrokers(
  requests: BrokerSupportRequest[],
  limit = 5,
): BrokerRequestSummary[] {
  const counts = new Map<string, number>();
  for (const request of requests) {
    const name = request.brokerName.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function buildActivityFeed(
  users: AdminUserSummary[],
  reports: BugReport[],
  brokerRequests: BrokerSupportRequest[],
  limit = 20,
): AdminActivityItem[] {
  const items: AdminActivityItem[] = [];

  for (const user of users) {
    if (!user.createdAt) continue;
    items.push({
      type: 'signup',
      at: user.createdAt,
      uid: user.uid,
      username: user.username,
      email: user.email,
    });
  }

  for (const report of reports) {
    items.push({
      type: 'bug',
      at: report.createdAt,
      id: report.id,
      email: report.email,
      preview: report.description.slice(0, 80),
      status: report.status,
    });
  }

  for (const request of brokerRequests) {
    items.push({
      type: 'broker',
      at: request.createdAt,
      id: request.id,
      brokerName: request.brokerName,
      email: request.email,
      status: request.status,
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/** Count registered accounts — users collection, with usernames as fallback. */
export async function fetchSignedUpUserCount(): Promise<number> {
  if (!isFirebaseConfigured()) return 0;

  const [users, usernames] = await Promise.all([
    countCollection('users'),
    countCollection('usernames'),
  ]);

  return Math.max(users ?? 0, usernames ?? 0);
}
