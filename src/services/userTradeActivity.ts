import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { Trade } from '../types';
import { getFirebaseDb } from '../lib/firebase';
import { maxDateKey, maxIsoTimestamp, normalizeTradeDate } from '../utils/format';

/** Keep denormalized trade activity on the user doc for fast, reliable admin reads. */
export async function touchUserTradeActivity(
  uid: string,
  sessionDates: string[],
  savedAt: string,
): Promise<void> {
  const normalized = sessionDates
    .map((d) => normalizeTradeDate(d))
    .filter((d): d is string => Boolean(d));
  const batchLatest = normalized.reduce<string | null>(
    (best, d) => maxDateKey(best, d),
    null,
  );

  const userRef = doc(getFirebaseDb(), 'users', uid);
  const existing = await getDoc(userRef);
  const prevSession = normalizeTradeDate(
    (existing.data() as { lastTradeSessionDate?: string } | undefined)?.lastTradeSessionDate,
  );
  const lastTradeSessionDate = maxDateKey(batchLatest, prevSession);

  await setDoc(
    userRef,
    {
      lastTradeActivityAt: savedAt,
      ...(lastTradeSessionDate ? { lastTradeSessionDate } : {}),
    },
    { merge: true },
  );
}

/** Backfill user activity fields from loaded trades (once per session). */
export async function syncUserTradeActivityFromTrades(
  uid: string,
  trades: Trade[],
): Promise<void> {
  if (trades.length === 0) return;

  const sessionDates = trades.map((t) => t.date);
  const savedAts = trades
    .map((t) => t.savedAt?.trim())
    .filter((s): s is string => Boolean(s));
  const maxSavedAt = savedAts.reduce<string | null>(
    (best, s) => maxIsoTimestamp(best, s),
    null,
  );

  if (maxSavedAt) {
    await touchUserTradeActivity(uid, sessionDates, maxSavedAt);
    return;
  }

  const normalized = sessionDates
    .map((d) => normalizeTradeDate(d))
    .filter((d): d is string => Boolean(d));
  const latestSession = normalized.reduce<string | null>(
    (best, d) => maxDateKey(best, d),
    null,
  );
  if (!latestSession) return;

  const userRef = doc(getFirebaseDb(), 'users', uid);
  const existing = await getDoc(userRef);
  const prevSession = normalizeTradeDate(
    (existing.data() as { lastTradeSessionDate?: string } | undefined)?.lastTradeSessionDate,
  );
  const lastTradeSessionDate = maxDateKey(latestSession, prevSession);
  if (!lastTradeSessionDate) return;

  await setDoc(userRef, { lastTradeSessionDate }, { merge: true });
}
