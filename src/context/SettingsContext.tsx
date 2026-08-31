import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import type { ThemeAccent, UserSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { Strategy } from '../types/strategy';
import { loadSettings, saveSettings } from '../utils/settingsStorage';
import { stripUndefinedDeep } from '../utils/firestoreData';
import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';

interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  addSetupTag: (tag: string) => void;
  addStrategy: (name: string, description?: string) => void;
  removeStrategy: (id: string) => void;
  addAccount: (name: string) => void;
  removeAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// profit/accent hex plus their R,G,B triplets (kept in sync so CSS can alpha-blend via
// rgba(var(--color-*-rgb), alpha) — see index.css). Every button, banner, focus ring, chart bar,
// and nav highlight across the app reads these two var pairs, so switching accent here recolors
// the whole authenticated app — including the share card's nebula glow, badge and username (see
// utils/shareCard.ts's resolveShareCardAccent). Only the landing page and the "TREND CHASERS"
// wordmark itself (everywhere it appears, share card included) intentionally stay fixed brand
// emerald, same as the logo.
const ACCENT_VARS: Record<ThemeAccent, { profit: string; profitRgb: string; accent: string; accentRgb: string }> = {
  emerald: { profit: '#34d399', profitRgb: '52, 211, 153', accent: '#38bdf8', accentRgb: '56, 189, 248' },
  cyan: { profit: '#22d3ee', profitRgb: '34, 211, 238', accent: '#2dd4bf', accentRgb: '45, 212, 191' },
  violet: { profit: '#a78bfa', profitRgb: '167, 139, 250', accent: '#818cf8', accentRgb: '129, 140, 248' },
};

function applyThemeAccent(accent: ThemeAccent) {
  const vars = ACCENT_VARS[accent];
  document.documentElement.style.setProperty('--color-profit-bright', vars.profit);
  document.documentElement.style.setProperty('--color-profit-bright-rgb', vars.profitRgb);
  document.documentElement.style.setProperty('--color-accent', vars.accent);
  document.documentElement.style.setProperty('--color-accent-rgb', vars.accentRgb);
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
    // Keyed on the uid on purpose: `user` is a new object on every token refresh, and depending on
    // it would refetch settings from Firestore each time one happened. The uid is the only part of
    // it this effect actually reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    applyThemeAccent(settings.themeAccent);
  }, [settings.themeAccent]);

  const persist = useCallback(
    (next: UserSettings, clearedKeys: string[] = []) => {
      setSettings(next);
      saveSettings(next, user?.uid);
      if (user && isFirebaseConfigured()) {
        /*
         * Clearing a setting has to actually clear it in the cloud.
         *
         * stripUndefinedDeep drops undefined keys and setDoc(merge: true) only writes the keys it
         * is given — so a field set to undefined was simply left untouched in Firestore and came
         * back on the next load. That made "Revoke share link" a lie: the token survived, and
         * because createCoachShare reuses an existing token, pressing Create again re-published
         * the *same URL* the user had revoked. The same hole silently restored trading-rule limits
         * a user had cleared.
         *
         * deleteField() is the sentinel that removes a key under a merge, so an explicitly
         * undefined setting is now explicitly deleted.
         */
        void setDoc(
          doc(getFirebaseDb(), 'users', user.uid, 'settings', 'preferences'),
          {
            ...stripUndefinedDeep(next),
            ...Object.fromEntries(clearedKeys.map((key) => [key, deleteField()])),
          },
          { merge: true },
        );
      }
    },
    [user],
  );

  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      // Keys the caller explicitly set to undefined are being cleared, not left alone — persist
      // needs to know which, because a merge write cannot express "remove this" on its own.
      const cleared = Object.keys(patch).filter(
        (key) => (patch as Record<string, unknown>)[key] === undefined,
      );
      persist({ ...settings, ...patch }, cleared);
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

  const addStrategy = useCallback(
    (name: string, description?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const strategy: Strategy = {
        id: crypto.randomUUID(),
        name: trimmed,
        description: description?.trim() || undefined,
        criteria: [],
        defaultTags: [],
      };
      persist({ ...settings, strategies: [...settings.strategies, strategy] });
    },
    [settings, persist],
  );

  const removeStrategy = useCallback(
    (id: string) => {
      persist({ ...settings, strategies: settings.strategies.filter((s) => s.id !== id) });
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
      addStrategy,
      removeStrategy,
      addAccount,
      removeAccount,
      setActiveAccount,
    }),
    [settings, updateSettings, addSetupTag, addStrategy, removeStrategy, addAccount, removeAccount, setActiveAccount],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
