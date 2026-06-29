import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface AdminHealthStatus {
  screenshotAi: { ok: boolean; hasApiKey?: boolean; error?: string };
  benchmark: { ok: boolean; asOf?: string; error?: string };
  firebase: { ok: boolean; error?: string };
}

export async function fetchAdminHealth(): Promise<AdminHealthStatus> {
  const [screenshotResult, benchmarkResult, firebaseResult] = await Promise.allSettled([
    fetch('/api/health').then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ ok?: boolean; hasApiKey?: boolean }>;
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
    screenshotAi:
      screenshotResult.status === 'fulfilled'
        ? {
            ok: screenshotResult.value.ok === true,
            hasApiKey: screenshotResult.value.hasApiKey,
          }
        : { ok: false, error: String(screenshotResult.reason) },
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
