import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SettingsContext } from './useSettings';
import { useAuth } from './useAuth';
import { useEntitlement } from './useEntitlement';
import { hasJournalRoom } from '../config/tiers';
import { isFirebaseConfigured } from '../lib/firebaseAuth';
// A root provider, so Firestore is loaded on demand — see lib/lazyFirestore.ts.
import { lazyFirestore } from '../lib/lazyFirestore';
import type { ThemeAccent, UserSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { Strategy } from '../types/strategy';
import { loadSettings, saveSettings } from '../utils/settingsStorage';
import { applyBrandMigration } from '../utils/brandMigration';
import { cleanRules } from '../utils/playbook';
import { stripUndefinedDeep } from '../utils/firestoreData';
import { reportErrorSilently } from '../services/errorReporting';
import { allJournalsView } from '../utils/journalScope';



// profit/accent hex plus their R,G,B triplets (kept in sync so CSS can alpha-blend via
// rgba(var(--color-*-rgb), alpha) — see index.css). Every button, banner, focus ring, chart bar,
// and nav highlight across the app reads these two var pairs, so switching accent here recolors
// the whole authenticated app — including the share card's nebula glow, badge and username (see
// the theme accent). Only the landing page and the "TREND CHASERS"
// wordmark itself (everywhere it appears, share card included) intentionally stay fixed brand
// lime, same as the logo.
//
// Lime uses one colour for both: on the brand's black there is one highlight, and a second hue
// beside it was what made the old navy look busy. The other three keep their two-tone pairs.
const ACCENT_VARS: Record<ThemeAccent, { profit: string; profitRgb: string; accent: string; accentRgb: string }> = {
  lime: { profit: '#7aff45', profitRgb: '122, 255, 69', accent: '#7aff45', accentRgb: '122, 255, 69' },
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
  const { limits } = useEntitlement();
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings(user?.uid));
  const [saveState, setSaveState] = useState<{ status: 'idle' | 'saved' | 'failed'; at: number }>({
    status: 'idle',
    at: 0,
  });

  useEffect(() => {
    // Clearing state before the fetch or subscription below. This is the external-system sync
    // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
    // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
    // rule rather than to fix a bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings(user?.uid));

    if (!user || !isFirebaseConfigured()) return;

    const loadCloud = async () => {
      try {
        const { fs, db } = await lazyFirestore();
        const snap = await fs.getDoc(fs.doc(db, 'users', user.uid, 'settings', 'preferences'));
        if (snap.exists()) {
          const cloud = snap.data() as Partial<UserSettings>;
          // brandVersion kept as the document has it (absent before the rebrand), so the one-time
          // move to lime applies to the cloud copy as well as the local cache — see brandMigration.
          const merged = applyBrandMigration({ ...DEFAULT_SETTINGS, ...cloud, brandVersion: cloud.brandVersion });
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
        /*
         * Caught, not floating.
         *
         * An unguarded promise here rejects into window.onunhandledrejection, which reports it
         * with no idea what it was — "FirebaseError: Missing or insufficient permissions" against
         * a stack of minified SDK frames, which is unreadable and unattributable. The same shape
         * of bug has been fixed twice already in the trade-write paths. The setting is saved
         * locally either way, so the user loses nothing until they open the app elsewhere.
         */
        void lazyFirestore()
          .then(({ fs, db }) =>
            fs.setDoc(
              fs.doc(db, 'users', user.uid, 'settings', 'preferences'),
              {
                ...stripUndefinedDeep(next),
                ...Object.fromEntries(clearedKeys.map((key) => [key, fs.deleteField()])),
              },
              { merge: true },
            ),
          )
          .then(() => setSaveState({ status: 'saved', at: Date.now() }))
          .catch((error: unknown) => {
            console.warn('[settings] could not save to the cloud; kept locally.', error);
            reportErrorSilently(error, 'promise', 'settings-save');
            setSaveState({ status: 'failed', at: Date.now() });
          });
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

  /**
   * Renames a tag everywhere it is used.
   *
   * The list alone is not the truth — every trade carries its setup as a string, so renaming only
   * the list would orphan the trades under the old name and split one setup into two rows on the
   * Performance breakdown. The trades have to be rewritten with it, which is why this needs a
   * callback the journal supplies rather than living purely in settings.
   */
  const renameSetupTag = useCallback(
    (from: string, to: string) => {
      const next = to.trim().toUpperCase();
      const previous = from.trim().toUpperCase();
      if (!next || next === previous) return;
      // Merging into an existing tag is allowed — it is how somebody fixes having created both
      // BREAKOUT and BREAK OUT — so a collision de-duplicates rather than being refused.
      const tags = settings.setupTags.map((t) => (t === previous ? next : t));
      persist({ ...settings, setupTags: [...new Set(tags)] });
    },
    [settings, persist],
  );

  const removeSetupTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toUpperCase();
      // Trades keep the tag they were saved with. Removing it from the list stops it being offered
      // on new trades; rewriting history to erase a label somebody actually used would be worse.
      persist({ ...settings, setupTags: settings.setupTags.filter((t) => t !== normalized) });
    },
    [settings, persist],
  );

  const addStrategy = useCallback(
    (name: string, description?: string): string | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const strategy: Strategy = {
        id: crypto.randomUUID(),
        name: trimmed,
        description: description?.trim() || undefined,
        criteria: [],
        defaultTags: [],
      };
      persist({ ...settings, strategies: [...settings.strategies, strategy] });
      return strategy.id;
    },
    [settings, persist],
  );

  const removeStrategy = useCallback(
    (id: string) => {
      persist({ ...settings, strategies: settings.strategies.filter((s) => s.id !== id) });
    },
    [settings, persist],
  );

  /*
   * Trades keep the checklist they were ticked against (see utils/playbook.ts), so changing a
   * strategy's rules here changes what future trades are asked, never what past ones recorded.
   */
  const updateStrategy = useCallback(
    (id: string, patch: { name?: string; description?: string; criteria?: string[] }) => {
      persist({
        ...settings,
        strategies: settings.strategies.map((s) =>
          s.id !== id
            ? s
            : {
                ...s,
                ...(patch.name !== undefined && patch.name.trim() ? { name: patch.name.trim() } : {}),
                ...(patch.description !== undefined ? { description: patch.description.trim() || undefined } : {}),
                ...(patch.criteria !== undefined ? { criteria: cleanRules(patch.criteria) } : {}),
              },
        ),
      });
    },
    [settings, persist],
  );

  /**
   * The plan's journal allowance, and whether there is room for another.
   *
   * Checked here rather than at each of the three places that offer to add one — the sidebar
   * picker, the account switcher and Settings — because a limit enforced in three places is a
   * limit that will eventually disagree with itself. The callers read `canAddJournal` to say so
   * before the click, which is the half that makes it feel like a boundary rather than a bug.
   */
  const journalLimit = limits.journals;
  const canAddJournal = hasJournalRoom(limits, settings.accounts.length);

  const addAccount = useCallback(
    (name: string): boolean => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      if (!hasJournalRoom(limits, settings.accounts.length)) return false;
      const id = crypto.randomUUID();
      persist({
        ...settings,
        accounts: [...settings.accounts, { id, name: trimmed }],
        activeAccountId: id,
      });
      return true;
    },
    [settings, persist, limits],
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
        persist({ ...settings, activeAccountId: id, viewAllJournals: false });
      }
    },
    [settings, persist],
  );

  /* The all-journals view, gated here once for every reader — see allJournalsView for why the
     stored flag on its own is never what anything reads. */
  const { canView: canViewAllJournals, viewing: viewingAllJournals } = allJournalsView({
    planIncludesIt: limits.combinedJournals,
    journalCount: settings.accounts.length,
    stored: settings.viewAllJournals,
  });

  const setViewAllJournals = useCallback(
    (on: boolean) => {
      if (on && !canViewAllJournals) return;
      if (settings.viewAllJournals === on) return;
      persist({ ...settings, viewAllJournals: on });
    },
    [settings, persist, canViewAllJournals],
  );

  const value = useMemo(
    () => ({
      settings,
      saveState,
      updateSettings,
      addSetupTag,
      renameSetupTag,
      removeSetupTag,
      addStrategy,
      removeStrategy,
      updateStrategy,
      addAccount,
      removeAccount,
      setActiveAccount,
      setViewAllJournals,
      viewingAllJournals,
      canViewAllJournals,
      journalLimit,
      canAddJournal,
    }),
    [
      settings,
      saveState,
      updateSettings,
      addSetupTag,
      renameSetupTag,
      removeSetupTag,
      addStrategy,
      removeStrategy,
      updateStrategy,
      addAccount,
      removeAccount,
      setActiveAccount,
      setViewAllJournals,
      viewingAllJournals,
      canViewAllJournals,
      journalLimit,
      canAddJournal,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

