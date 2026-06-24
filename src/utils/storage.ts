import type { Trade } from '../types';

const STORAGE_KEY = 'trading-journal-trades';

// IDs from the removed demo dataset — used to one-time purge seeded sample trades
const SAMPLE_IDS = new Set(Array.from({ length: 35 }, (_, i) => String(i + 1)));

export function loadTrades(): Trade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const trades = JSON.parse(raw) as Trade[];
    if (trades.length > 0 && trades.every((t) => SAMPLE_IDS.has(t.id))) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return trades;
  } catch {
    return [];
  }
}

export function saveTrades(trades: Trade[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}
