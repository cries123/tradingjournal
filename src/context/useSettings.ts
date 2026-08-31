import { createContext, useContext } from 'react';
import type { UserSettings } from '../types/settings';

/**
 * The SettingsContext object and its hook, kept apart from the provider that fills it.
 *
 * Splitting them is what lets the provider file hot-reload: a module exporting both a
 * component and plain values is rebuilt wholesale on every edit, losing the state the
 * provider is holding. Everything importing useSettings keeps working unchanged.
 */
export interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  addSetupTag: (tag: string) => void;
  addStrategy: (name: string, description?: string) => void;
  removeStrategy: (id: string) => void;
  addAccount: (name: string) => void;
  removeAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
