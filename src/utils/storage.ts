import type { Trade } from '../types';
import { reportErrorSilently } from '../services/errorReporting';

const STORAGE_PREFIX = 'trading-journal-trades';
/** @deprecated Unscoped key — cleared on sign-in to prevent cross-user leaks */
const LEGACY_KEY = 'trading-journal-trades';

const SAMPLE_IDS = new Set(Array.from({ length: 35 }, (_, i) => String(i + 1)));

function tradesKey(userId?: string | null): string {
  if (userId) return `${STORAGE_PREFIX}:${userId}`;
  return `${STORAGE_PREFIX}:local`;
}

function parseTrades(raw: string): Trade[] {
  const trades = JSON.parse(raw) as Trade[];
  if (trades.length > 0 && trades.every((t) => SAMPLE_IDS.has(t.id))) {
    return [];
  }
  return trades;
}

/** Load trades for anonymous (`null`) or a specific signed-in user. Never reads another user's cache. */
export function loadTrades(userId?: string | null): Trade[] {
  try {
    const key = tradesKey(userId);
    let raw = localStorage.getItem(key);

    // One-time: move legacy unscoped trades into the anonymous bucket only
    if (!userId && !raw) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }

    if (!raw) return [];
    return parseTrades(raw);
  } catch {
    return [];
  }
}

/*
 * Reported once per session, not once per write.
 *
 * In a browser where storage is blocked outright, EVERY write throws — a trader logging ten trades
 * would file ten identical reports, and the admin error panel would be nothing else. One is enough
 * to tell me it is happening.
 */
let writeFailureReported = false;

function reportStorageFailure(err: unknown, scope: string): void {
  if (writeFailureReported) return;
  writeFailureReported = true;
  reportErrorSilently(err, 'window', scope);
}

/**
 * Writes the local cache. Never throws.
 *
 * localStorage.setItem throws for two reasons that both reach real users: the ~5MB quota, and
 * Safari with site data blocked or in a private window, where it throws on every single write.
 *
 * Every caller sits INSIDE a React state updater — `saveTrades(next, null)` in the middle of a
 * setTrades callback in useTrades — so a throw here surfaced during a state update, past no catch
 * at all, and took the app to the ErrorBoundary crash screen. Logging a trade on an iPhone in
 * private browsing did exactly that, and loadTrades right above has had a try/catch the whole time.
 *
 * Swallowed rather than surfaced, because of what this store is: for a signed-in trader it is only
 * a cache and Firestore holds the real copy, and for a signed-out one a failed write is a bad
 * outcome that a crash screen does not improve. It is reported so that it stops being invisible.
 */
export function saveTrades(trades: Trade[], userId?: string | null): void {
  try {
    localStorage.setItem(tradesKey(userId), JSON.stringify(trades));
  } catch (err) {
    reportStorageFailure(err, 'local-trades-write');
  }
}

export function clearTrades(userId?: string | null): void {
  try {
    localStorage.removeItem(tradesKey(userId));
  } catch (err) {
    // Same blocked-storage case as the write above. Nothing to clear is the desired end state
    // anyway, so there is nothing to recover from here.
    reportStorageFailure(err, 'local-trades-clear');
  }
}

/** Remove old shared key so a new sign-up cannot inherit another user's cached trades. */
export function clearLegacyTradesStorage(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch (err) {
    // This one runs on sign-in, before any of the app is on screen.
    reportStorageFailure(err, 'local-trades-legacy-clear');
  }
}

/** Test seam: the once-per-session latch above would otherwise leak between test cases. */
export function __resetStorageFailureLatchForTests(): void {
  writeFailureReported = false;
}
