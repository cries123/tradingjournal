import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import type { ErrorKind } from './errorFingerprint';

/** Reading the production error feed. Admin-only — the security rules enforce it, not this file. */

export type ErrorStatus = 'open' | 'resolved' | 'ignored';

export interface ErrorEvent {
  id: string;
  fingerprint: string;
  kind: ErrorKind;
  name: string;
  message: string;
  stack: string;
  scope: string | null;
  lastPath: string;
  lastRelease: string;
  lastUserAgent: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  affectedUids: string[];
  affectedUserCount: number;
  status: ErrorStatus;
}

/** Enough to see everything that matters; more than this and the panel is a log, not a summary. */
const MAX_EVENTS = 100;

export async function fetchErrorEvents(): Promise<ErrorEvent[]> {
  if (!isFirebaseConfigured()) return [];

  const q = query(
    collection(getFirebaseDb(), 'errorEvents'),
    orderBy('lastSeenAt', 'desc'),
    limit(MAX_EVENTS),
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as Partial<ErrorEvent>;
    return {
      id: d.id,
      fingerprint: data.fingerprint ?? d.id,
      kind: data.kind ?? 'window',
      name: data.name ?? 'Error',
      message: data.message ?? '',
      stack: data.stack ?? '',
      scope: data.scope ?? null,
      lastPath: data.lastPath ?? '/',
      lastRelease: data.lastRelease ?? 'unknown',
      lastUserAgent: data.lastUserAgent ?? '',
      firstSeenAt: data.firstSeenAt ?? '',
      lastSeenAt: data.lastSeenAt ?? '',
      count: data.count ?? 0,
      affectedUids: data.affectedUids ?? [],
      affectedUserCount: data.affectedUserCount ?? 0,
      status: data.status ?? 'open',
    };
  });
}

/**
 * How much was dropped today, if anything.
 *
 * The daily budget silently stops recording past its ceiling, and a feed that has quietly stopped
 * telling the truth is worse than one that says so. Zero is the normal answer.
 */
export async function fetchErrorsDroppedToday(): Promise<number> {
  if (!isFirebaseConfigured()) return 0;

  // The budget doc is keyed by UTC day, so this is a single point read rather than a query.
  const day = new Date().toISOString().slice(0, 10);
  const snap = await getDoc(doc(getFirebaseDb(), 'errorBudget', day));
  return (snap.data()?.dropped as number | undefined) ?? 0;
}

export async function updateErrorEventStatus(id: string, status: ErrorStatus): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), 'errorEvents', id), { status });
}
