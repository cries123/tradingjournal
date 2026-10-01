import type { UserSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

const STORAGE_KEY = 'trading-journal-settings';

export function loadSettings(userId?: string | null): UserSettings {
  const key = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      setupTags: parsed.setupTags?.length ? parsed.setupTags : DEFAULT_SETTINGS.setupTags,
      accounts: parsed.accounts?.length ? parsed.accounts : DEFAULT_SETTINGS.accounts,
      strategies: parsed.strategies ?? DEFAULT_SETTINGS.strategies,
      tradingRules: { ...DEFAULT_SETTINGS.tradingRules, ...parsed.tradingRules },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Caches settings locally. Never throws.
 *
 * loadSettings above has always been guarded and this was not, which is the more dangerous half:
 * settings are written on nearly every interaction — changing journal, adding a tag, editing a rule
 * — so in a browser that refuses storage this threw out of whatever handler the trader had just
 * used. Signed in, Firestore holds the real copy and this is only a cache.
 */
export function saveSettings(settings: UserSettings, userId?: string | null): void {
  const key = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // Quota, or a browser with site data blocked.
  }
}
