import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Trade } from '../types';
import { getFirebaseDb } from '../lib/firebase';
import { touchUserTradeActivity } from './userTradeActivity';

function tradesCollection(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'trades');
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export async function fetchTradesOnce(uid: string): Promise<Trade[]> {
  const snap = await getDocs(tradesCollection(uid));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trade);
}

/**
 * The journal's live view of its own trades.
 *
 * onError is not optional in practice. Without it a failed listen is silent: Firestore has nowhere
 * to deliver the error, the callback simply stops being called, and the app goes on showing the
 * last snapshot it received as though it were current. On a phone that has been in the background
 * long enough for the auth token to lapse, that is a journal quietly frozen in the past.
 */
export function subscribeTrades(
  uid: string,
  onChange: (trades: Trade[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    tradesCollection(uid),
    (snap) => {
      const trades = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trade);
      trades.sort((a, b) => a.date.localeCompare(b.date));
      onChange(trades);
    },
    (error) => onError?.(error),
  );
}


/**
 * Denormalized activity fields for the admin panel, written after the trades themselves.
 *
 * Deliberately swallowed. These fields exist so an admin list can sort by last activity without
 * reading everyone's trades — nice to have, and nothing a trader ever sees. Awaiting it unguarded
 * meant a failure here rejected saveTradesBatch AFTER every trade had already been committed, so a
 * sync that fully worked reported itself as failed and threw into an unhandled rejection.
 */
async function touchActivityQuietly(uid: string, dates: string[], savedAt: string): Promise<void> {
  try {
    await touchUserTradeActivity(uid, dates, savedAt);
  } catch (error) {
    console.warn('[trades] activity bookkeeping failed; the trades themselves are saved.', error);
  }
}

export async function saveTrade(uid: string, trade: Trade): Promise<void> {
  const savedAt = new Date().toISOString();
  await setDoc(
    doc(tradesCollection(uid), trade.id),
    stripUndefined({
      ...(trade as unknown as Record<string, unknown>),
      savedAt,
    }),
  );
  await touchActivityQuietly(uid, [trade.date], savedAt);
}

// Firestore limits a WriteBatch to 500 operations.
const BATCH_LIMIT = 400;

export async function saveTradesBatch(uid: string, trades: Trade[]): Promise<void> {
  if (trades.length === 0) return;
  const savedAt = new Date().toISOString();

  for (let offset = 0; offset < trades.length; offset += BATCH_LIMIT) {
    const chunk = trades.slice(offset, offset + BATCH_LIMIT);
    const batch = writeBatch(getFirebaseDb());
    for (const trade of chunk) {
      batch.set(
        doc(tradesCollection(uid), trade.id),
        stripUndefined({
          ...(trade as unknown as Record<string, unknown>),
          savedAt,
        }),
      );
    }
    await batch.commit();
  }

  await touchActivityQuietly(
    uid,
    trades.map((t) => t.date),
    savedAt,
  );
}

export async function deleteTradeDoc(uid: string, tradeId: string): Promise<void> {
  await deleteDoc(doc(tradesCollection(uid), tradeId));
}

/**
 * Deletes many trades at once, chunked to stay under Firestore's per-batch write limit.
 *
 * Used by the duplicate cleanup, where the whole point is that the count can be large — a journal
 * that got imported twice can easily have more rows to remove than a single batch will take.
 */
export async function deleteTradesBatch(uid: string, tradeIds: string[]): Promise<void> {
  if (tradeIds.length === 0) return;

  for (let offset = 0; offset < tradeIds.length; offset += BATCH_LIMIT) {
    const chunk = tradeIds.slice(offset, offset + BATCH_LIMIT);
    const batch = writeBatch(getFirebaseDb());
    for (const id of chunk) {
      batch.delete(doc(tradesCollection(uid), id));
    }
    await batch.commit();
  }
}

export async function deleteAllTrades(uid: string): Promise<void> {
  const snap = await getDocs(tradesCollection(uid));
  // Chunked for the same reason as the batch writes above: one commit can't clear a journal with
  // more than a few hundred trades, and it fails outright rather than partially.
  await deleteTradesBatch(uid, snap.docs.map((d) => d.id));
}

export async function migrateLocalTrades(uid: string, localTrades: Trade[]): Promise<number> {
  if (localTrades.length === 0) return 0;
  const existing = await fetchTradesOnce(uid);
  if (existing.length > 0) return 0;
  await saveTradesBatch(uid, localTrades);
  return localTrades.length;
}
