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
      psychologyTags: parsed.psychologyTags?.length ? parsed.psychologyTags : DEFAULT_SETTINGS.psychologyTags,
      marketContextTags: parsed.marketContextTags?.length ? parsed.marketContextTags : DEFAULT_SETTINGS.marketContextTags,
      accounts: parsed.accounts?.length ? parsed.accounts : DEFAULT_SETTINGS.accounts,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: UserSettings, userId?: string | null): void {
  const key = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  localStorage.setItem(key, JSON.stringify(settings));
}
