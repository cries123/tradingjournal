import type { Trade } from '../types';

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

export function saveTrades(trades: Trade[], userId?: string | null): void {
  localStorage.setItem(tradesKey(userId), JSON.stringify(trades));
}

export function clearTrades(userId?: string | null): void {
  localStorage.removeItem(tradesKey(userId));
}

/** Remove old shared key so a new sign-up cannot inherit another user's cached trades. */
export function clearLegacyTradesStorage(): void {
  localStorage.removeItem(LEGACY_KEY);
}
