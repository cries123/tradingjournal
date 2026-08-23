import { addDoc, collection, doc, getDoc, getDocs, limit as fbLimit, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface AdminHealthStatus {
  brokerSync: { ok: boolean; configured?: boolean; error?: string };
  benchmark: { ok: boolean; asOf?: string; error?: string };
  firebase: { ok: boolean; error?: string };
}

export interface AdminHealthSnapshot {
  at: string;
  brokerSyncOk: boolean;
  benchmarkOk: boolean;
  firebaseOk: boolean;
}

export async function fetchAdminHealth(): Promise<AdminHealthStatus> {
  const [brokerResult, benchmarkResult, firebaseResult] = await Promise.allSettled([
    fetch('/api/broker-status').then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ ok?: boolean; configured?: boolean }>;
    }),
    fetch('/api/benchmark?symbol=SPY').then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ asOf?: string }>;
    }),
    (async () => {
      if (!isFirebaseConfigured()) throw new Error('Not configured');
      await getDoc(doc(getFirebaseDb(), 'config', 'admin'));
    })(),
  ]);

  return {
    brokerSync:
      brokerResult.status === 'fulfilled'
        ? {
            ok: brokerResult.value.ok === true,
            configured: brokerResult.value.configured,
          }
        : { ok: false, error: String(brokerResult.reason) },
    benchmark:
      benchmarkResult.status === 'fulfilled'
        ? { ok: true, asOf: benchmarkResult.value.asOf }
        : { ok: false, error: String(benchmarkResult.reason) },
    firebase:
      firebaseResult.status === 'fulfilled'
        ? { ok: true }
        : { ok: false, error: String(firebaseResult.reason) },
  };
}

/** Best-effort: records one point-in-time health snapshot so the panel can show a trend over time. */
export async function recordAdminHealthSnapshot(status: AdminHealthStatus): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await addDoc(collection(getFirebaseDb(), 'adminHealthHistory'), {
      at: new Date().toISOString(),
      brokerSyncOk: status.brokerSync.ok,
      benchmarkOk: status.benchmark.ok,
      firebaseOk: status.firebase.ok,
    });
  } catch {
    // Non-critical — the live status already rendered from the check itself.
  }
}

export async function fetchAdminHealthHistory(max = 30): Promise<AdminHealthSnapshot[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const q = query(collection(getFirebaseDb(), 'adminHealthHistory'), orderBy('at', 'desc'), fbLimit(max));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as AdminHealthSnapshot)
      .reverse(); // oldest → newest, so the timeline reads left to right
  } catch {
    return [];
  }
}
