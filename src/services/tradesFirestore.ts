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
  const payload = stripUndefined({
    ...(trade as unknown as Record<string, unknown>),
    savedAt: new Date().toISOString(),
  });
  await setDoc(doc(tradesCollection(uid), trade.id), payload);
}

export async function saveTradesBatch(uid: string, trades: Trade[]): Promise<void> {
  const batch = writeBatch(getFirebaseDb());
  const savedAt = new Date().toISOString();
  for (const trade of trades) {
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
