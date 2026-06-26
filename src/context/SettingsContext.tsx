import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import type { ThemeAccent, UserSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { loadSettings, saveSettings } from '../utils/settingsStorage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  addSetupTag: (tag: string) => void;
  addPsychologyTag: (tag: string) => void;
  addMarketContextTag: (tag: string) => void;
  addAccount: (name: string) => void;
  removeAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const ACCENT_VARS: Record<ThemeAccent, { profit: string; accent: string }> = {
  emerald: { profit: '#34d399', accent: '#38bdf8' },
  cyan: { profit: '#22d3ee', accent: '#38bdf8' },
  violet: { profit: '#a78bfa', accent: '#818cf8' },
};

function applyThemeAccent(accent: ThemeAccent) {
  const vars = ACCENT_VARS[accent];
  document.documentElement.style.setProperty('--color-profit-bright', vars.profit);
  document.documentElement.style.setProperty('--color-accent', vars.accent);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings(user?.uid));

  useEffect(() => {
    setSettings(loadSettings(user?.uid));

    if (!user || !isFirebaseConfigured()) return;

    const loadCloud = async () => {
      try {
        const db = getFirebaseDb();
        const snap = await getDoc(doc(db, 'users', user.uid, 'settings', 'preferences'));
        if (snap.exists()) {
          const cloud = snap.data() as Partial<UserSettings>;
          const merged = { ...DEFAULT_SETTINGS, ...cloud };
          setSettings(merged);
          saveSettings(merged, user.uid);
        }
      } catch {
        /* use local */
      }
    };

    void loadCloud();
  }, [user?.uid]);

  useEffect(() => {
    applyThemeAccent(settings.themeAccent);
  }, [settings.themeAccent]);

  const persist = useCallback(
    (next: UserSettings) => {
      setSettings(next);
      saveSettings(next, user?.uid);
      if (user && isFirebaseConfigured()) {
        void setDoc(doc(getFirebaseDb(), 'users', user.uid, 'settings', 'preferences'), next, {
          merge: true,
        });
      }
    },
    [user],
  );

  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      persist({ ...settings, ...patch });
    },
    [settings, persist],
  );

  const addSetupTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toUpperCase();
      if (!normalized || settings.setupTags.includes(normalized)) return;
      persist({ ...settings, setupTags: [...settings.setupTags, normalized] });
    },
    [settings, persist],
  );

  const addPsychologyTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toUpperCase();
      if (!normalized || settings.psychologyTags.includes(normalized)) return;
      persist({ ...settings, psychologyTags: [...settings.psychologyTags, normalized] });
    },
    [settings, persist],
  );

  const addMarketContextTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toUpperCase();
      if (!normalized || settings.marketContextTags.includes(normalized)) return;
      persist({ ...settings, marketContextTags: [...settings.marketContextTags, normalized] });
    },
    [settings, persist],
  );

  const addAccount = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const id = crypto.randomUUID();
      persist({
        ...settings,
        accounts: [...settings.accounts, { id, name: trimmed }],
        activeAccountId: id,
      });
    },
    [settings, persist],
  );

  const removeAccount = useCallback(
    (id: string) => {
      if (settings.accounts.length <= 1) return;
      const accounts = settings.accounts.filter((a) => a.id !== id);
      persist({
        ...settings,
        accounts,
        activeAccountId: settings.activeAccountId === id ? accounts[0].id : settings.activeAccountId,
      });
    },
    [settings, persist],
  );

  const setActiveAccount = useCallback(
    (id: string) => {
      if (settings.accounts.some((a) => a.id === id)) {
        persist({ ...settings, activeAccountId: id });
      }
    },
    [settings, persist],
  );

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      addSetupTag,
      addPsychologyTag,
      addMarketContextTag,
      addAccount,
      removeAccount,
      setActiveAccount,
    }),
    [settings, updateSettings, addSetupTag, addPsychologyTag, addMarketContextTag, addAccount, removeAccount, setActiveAccount],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
