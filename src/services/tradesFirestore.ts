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

export function subscribeTrades(uid: string, onChange: (trades: Trade[]) => void): Unsubscribe {
  return onSnapshot(tradesCollection(uid), (snap) => {
    const trades = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trade);
    trades.sort((a, b) => a.date.localeCompare(b.date));
    onChange(trades);
  });
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
  await touchUserTradeActivity(uid, [trade.date], savedAt);
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

  await touchUserTradeActivity(
    uid,
    trades.map((t) => t.date),
    savedAt,
  );
}

export async function deleteTradeDoc(uid: string, tradeId: string): Promise<void> {
  await deleteDoc(doc(tradesCollection(uid), tradeId));
}

export async function deleteAllTrades(uid: string): Promise<void> {
  const snap = await getDocs(tradesCollection(uid));
  const batch = writeBatch(getFirebaseDb());
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function migrateLocalTrades(uid: string, localTrades: Trade[]): Promise<number> {
  if (localTrades.length === 0) return 0;
  const existing = await fetchTradesOnce(uid);
  if (existing.length > 0) return 0;
  await saveTradesBatch(uid, localTrades);
  return localTrades.length;
}
