import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

const VISITOR_ID_KEY = 'tc_visitor_id';

export interface VisitorStats {
  totalUniqueVisitors: number;
  totalConverted: number;
  conversionRate: number;
  last7DaysVisitors: number;
  last7DaysSignups: number;
  last7DaysConversionRate: number;
  dailyLast7: { date: string; label: string; visitors: number }[];
}

export interface VisitorStatsResult {
  stats: VisitorStats;
  error: string | null;
}

function emptyVisitorStats(signupsLast7Days: number): VisitorStats {
  return {
    totalUniqueVisitors: 0,
    totalConverted: 0,
    conversionRate: 0,
    last7DaysVisitors: 0,
    last7DaysSignups: signupsLast7Days,
    last7DaysConversionRate: 0,
    dailyLast7: last7DayKeys().map((date) => ({
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
      visitors: 0,
    })),
  };
}

export function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function last7DayKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

/** Records one anonymous visit per visitor per day (logged-out users only). */
export async function recordAnonymousVisit(path: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (getFirebaseAuth().currentUser) return;

  const visitorId = getVisitorId();
  if (!visitorId) return;

  const date = todayUtc();
  const db = getFirebaseDb();
  const dailyRef = doc(db, 'analyticsDailyVisitors', `${date}_${visitorId}`);
  const existing = await getDoc(dailyRef);
  const now = new Date().toISOString();

  if (!existing.exists()) {
    await setDoc(dailyRef, {
      visitorId,
      date,
      path,
      createdAt: now,
    });
    await setDoc(doc(db, 'analyticsVisitors', visitorId), {
      visitorId,
      firstSeenAt: now,
      lastSeenAt: now,
      lastPath: path,
      converted: false,
    });
    return;
  }

  await setDoc(
    doc(db, 'analyticsVisitors', visitorId),
    {
      lastSeenAt: now,
      lastPath: path,
    },
    { merge: true },
  );
}

export async function markVisitorConverted(visitorId: string, uid: string): Promise<void> {
  if (!isFirebaseConfigured() || !visitorId) return;

  await setDoc(
    doc(getFirebaseDb(), 'analyticsVisitors', visitorId),
    {
      converted: true,
      convertedAt: new Date().toISOString(),
      signupUid: uid,
    },
    { merge: true },
  );
}

export async function fetchVisitorStats(signupsLast7Days: number): Promise<VisitorStatsResult> {
  const empty = emptyVisitorStats(signupsLast7Days);
  if (!isFirebaseConfigured()) {
    return { stats: empty, error: null };
  }

  const db = getFirebaseDb();
  const dayKeys = last7DayKeys();
  const weekStart = dayKeys[0];

  try {
    const [totalSnap, convertedSnap, weekSnap] = await Promise.all([
      getCountFromServer(collection(db, 'analyticsVisitors')),
      getCountFromServer(query(collection(db, 'analyticsVisitors'), where('converted', '==', true))),
      getDocs(query(collection(db, 'analyticsDailyVisitors'), where('date', '>=', weekStart))),
    ]);

    const totalUniqueVisitors = totalSnap.data().count;
    const totalConverted = convertedSnap.data().count;
    const conversionRate =
      totalUniqueVisitors > 0 ? (totalConverted / totalUniqueVisitors) * 100 : 0;

    const byDate = new Map<string, number>();
    const weekVisitorIds = new Set<string>();
    for (const key of dayKeys) {
      byDate.set(key, 0);
    }

    for (const docSnap of weekSnap.docs) {
      const data = docSnap.data() as { date?: string; visitorId?: string };
      const date = data.date;
      const visitorId = data.visitorId;
      if (date && byDate.has(date)) {
        byDate.set(date, (byDate.get(date) ?? 0) + 1);
      }
      if (visitorId) weekVisitorIds.add(visitorId);
    }

    const dailyLast7 = dayKeys.map((date) => ({
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
      visitors: byDate.get(date) ?? 0,
    }));

    const last7DaysVisitors = weekVisitorIds.size;
    const last7DaysConversionRate =
      last7DaysVisitors > 0 ? (signupsLast7Days / last7DaysVisitors) * 100 : 0;

    return {
      stats: {
        totalUniqueVisitors,
        totalConverted,
        conversionRate,
        last7DaysVisitors,
        last7DaysSignups: signupsLast7Days,
        last7DaysConversionRate,
        dailyLast7,
      },
      error: null,
    };
  } catch {
    return {
      stats: empty,
      error:
        'Could not load visitor stats. Run: firebase deploy --only firestore:rules',
    };
  }
}
