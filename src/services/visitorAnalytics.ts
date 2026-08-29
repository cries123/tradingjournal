import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

const VISITOR_ID_KEY = 'tc_visitor_id';
/** Last UTC date this browser successfully wrote a daily visit doc for. */
const VISITOR_DAY_KEY = 'tc_visitor_day';

export interface VisitorStats {
  totalUniqueVisitors: number;
  totalConverted: number;
  conversionRate: number;
  /** Visitors who opened the journal itself, signed up or not. */
  openedApp: number;
  /** Opened the journal and never created an account — the local-only crowd. */
  localOnlyUsers: number;
  /** Never got past the marketing pages. */
  browsedOnly: number;
  last7DaysVisitors: number;
  last7DaysSignups: number;
  last7DaysConversionRate: number;
  dailyLast7: { date: string; label: string; visitors: number }[];
}

export interface VisitorStatsResult {
  stats: VisitorStats;
  error: string | null;
}

/** Exported so callers building a fallback state can't drift out of sync with the real shape —
 *  two hand-rolled copies of this object in AdminPage were exactly how that happened before. */
export function emptyVisitorStats(signupsLast7Days: number): VisitorStats {
  return {
    totalUniqueVisitors: 0,
    totalConverted: 0,
    conversionRate: 0,
    openedApp: 0,
    localOnlyUsers: 0,
    browsedOnly: 0,
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

function alreadyRecordedToday(): boolean {
  try {
    return localStorage.getItem(VISITOR_DAY_KEY) === todayUtc();
  } catch {
    return false;
  }
}

function markRecordedToday(): void {
  try {
    localStorage.setItem(VISITOR_DAY_KEY, todayUtc());
  } catch {
    // Private browsing with storage disabled — we simply re-attempt the write next navigation.
  }
}

/**
 * Records one anonymous visit per visitor per day (logged-out users only).
 *
 * Deliberately never READS from Firestore. The previous version called getDoc() on the daily
 * doc to decide whether to create it, but the security rule on that collection is
 * `allow read: if isAdmin()` — so for an actual anonymous visitor that first read threw
 * permission-denied and the whole function rejected before writing anything. The result was a
 * visitor counter that could never move off zero. Dedupe now happens against localStorage
 * instead, which is where the visitor id already lives.
 *
 * Errors are swallowed on purpose: analytics must never be able to break a page load.
 */
export async function recordAnonymousVisit(path: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (getFirebaseAuth().currentUser) return;

  const visitorId = getVisitorId();
  if (!visitorId) return;

  const db = getFirebaseDb();
  const now = new Date().toISOString();
  // Anything under /app means they're actually using the journal, not just reading the pitch.
  const openedApp = path === '/app' || path.startsWith('/app/');

  // Heartbeat the profile every navigation so lastPath/openedApp stay current. updateDoc is
  // tried first because it can't clobber the conversion flag; it throws if the profile doesn't
  // exist yet, which is exactly when the create below is the right call.
  try {
    await updateDoc(doc(db, 'analyticsVisitors', visitorId), {
      lastSeenAt: now,
      lastPath: path,
      ...(openedApp ? { openedApp: true } : {}),
    });
  } catch {
    try {
      await setDoc(doc(db, 'analyticsVisitors', visitorId), {
        visitorId,
        firstSeenAt: now,
        lastSeenAt: now,
        lastPath: path,
        openedApp,
        converted: false,
      });
    } catch {
      // Rules rejected it, or the network is down. Nothing else to do — this is best-effort.
    }
  }

  // The daily doc is create-only by rule, so only attempt it once per UTC day per browser.
  if (alreadyRecordedToday()) return;

  try {
    await setDoc(doc(db, 'analyticsDailyVisitors', `${todayUtc()}_${visitorId}`), {
      visitorId,
      date: todayUtc(),
      path,
      createdAt: now,
    });
    markRecordedToday();
  } catch {
    // Most likely this browser already has today's doc from a session where localStorage was
    // cleared; the rule denies the overwrite, which is the correct outcome either way.
    markRecordedToday();
  }
}

export async function markVisitorConverted(visitorId: string, uid: string): Promise<void> {
  if (!isFirebaseConfigured() || !visitorId) return;

  try {
    await setDoc(
      doc(getFirebaseDb(), 'analyticsVisitors', visitorId),
      {
        converted: true,
        convertedAt: new Date().toISOString(),
        signupUid: uid,
      },
      { merge: true },
    );
  } catch {
    // A missed conversion flag costs one row of accuracy in the funnel; it must never be
    // allowed to fail the signup that triggered it.
  }
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
    // Every query here uses at most one equality filter so it runs on Firestore's automatic
    // single-field indexes — no composite index to create in the console. The converted set is
    // fetched in full rather than counted because it's bounded by the signup count (small) and
    // we need to know how many of those had opened the app, which a count query can't tell us
    // without a composite index on (converted, openedApp).
    const [totalSnap, openedAppSnap, convertedDocs, weekSnap] = await Promise.all([
      getCountFromServer(collection(db, 'analyticsVisitors')),
      getCountFromServer(query(collection(db, 'analyticsVisitors'), where('openedApp', '==', true))),
      getDocs(query(collection(db, 'analyticsVisitors'), where('converted', '==', true))),
      getDocs(query(collection(db, 'analyticsDailyVisitors'), where('date', '>=', weekStart))),
    ]);

    const totalUniqueVisitors = totalSnap.data().count;
    const openedApp = openedAppSnap.data().count;
    const totalConverted = convertedDocs.size;
    const convertedWhoOpenedApp = convertedDocs.docs.filter(
      (d) => (d.data() as { openedApp?: boolean }).openedApp === true,
    ).length;

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
        openedApp,
        localOnlyUsers: Math.max(0, openedApp - convertedWhoOpenedApp),
        browsedOnly: Math.max(0, totalUniqueVisitors - openedApp),
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
      error: 'Could not load visitor stats — re-publish firestore.rules in the Firebase console.',
    };
  }
}
