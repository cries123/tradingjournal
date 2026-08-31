import { addDoc, collection, doc, getDoc, getDocs, limit as fbLimit, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface PaymentsHealth {
  ok: boolean;
  /** Enough set up to start a checkout: API key plus all three product ids. */
  checkoutReady: boolean;
  /** The webhook secret. Without it payments succeed and nobody is ever upgraded. */
  webhookReady: boolean;
  testMode: boolean;
  /**
   * False when the owner has paused purchases from the admin panel.
   *
   * Kept apart from `ok` on purpose: a pause is a deliberate choice, not an outage, and reporting
   * it as one trains the owner to ignore the health panel.
   */
  checkoutEnabled?: boolean;
  /** The Creem host the server will actually call — the half of a 401 you can't otherwise see. */
  baseUrl?: string;
  /** A test-looking key with CREEM_TEST_MODE explicitly false. Guaranteed "Invalid API Key". */
  modeMismatch?: boolean;
  /** Names of the environment variables the server can't see. Never any values. */
  missing: string[];
  error?: string;
}

export interface AdminHealthStatus {
  brokerSync: { ok: boolean; configured?: boolean; error?: string };
  benchmark: { ok: boolean; asOf?: string; error?: string };
  firebase: { ok: boolean; error?: string };
  payments: PaymentsHealth;
}

export interface AdminHealthSnapshot {
  at: string;
  brokerSyncOk: boolean;
  benchmarkOk: boolean;
  firebaseOk: boolean;
  paymentsOk?: boolean;
}

/**
 * Turns a failed API response into something worth reading.
 *
 * "HTTP 500" tells the site owner that something is broken, which they already knew from the
 * users complaining. The handlers all return a JSON `error` explaining what actually went wrong,
 * so surface it — the point of a health panel is to end the guessing, not to confirm it.
 */
async function describeFailure(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ? `HTTP ${res.status} — ${body.error}` : `HTTP ${res.status}`;
}

export async function fetchAdminHealth(): Promise<AdminHealthStatus> {
  const [brokerResult, benchmarkResult, firebaseResult, paymentsResult] = await Promise.allSettled([
    fetch('/api/broker-status').then(async (res) => {
      if (!res.ok) throw new Error(await describeFailure(res));
      return res.json() as Promise<{ ok?: boolean; configured?: boolean }>;
    }),
    fetch('/api/benchmark?symbol=SPY').then(async (res) => {
      if (!res.ok) throw new Error(await describeFailure(res));
      return res.json() as Promise<{ asOf?: string }>;
    }),
    (async () => {
      if (!isFirebaseConfigured()) throw new Error('Not configured');
      await getDoc(doc(getFirebaseDb(), 'config', 'admin'));
    })(),
    fetch('/api/payments-status').then(async (res) => {
      if (!res.ok) throw new Error(await describeFailure(res));
      return res.json() as Promise<Omit<PaymentsHealth, 'error'>>;
    }),
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
    payments:
      paymentsResult.status === 'fulfilled'
        ? paymentsResult.value
        : {
            ok: false,
            checkoutReady: false,
            webhookReady: false,
            testMode: false,
            missing: [],
            error: String(paymentsResult.reason),
          },
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
      paymentsOk: status.payments.ok,
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
