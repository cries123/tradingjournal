import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface AdminHealthStatus {
  brokerSync: { ok: boolean; configured?: boolean; error?: string };
  benchmark: { ok: boolean; asOf?: string; error?: string };
  firebase: { ok: boolean; error?: string };
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
