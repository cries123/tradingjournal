import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import type { Trade } from '../types';
import { removeLeaderboardEntry, upsertLeaderboardEntry } from '../services/leaderboard';

const SYNC_DEBOUNCE_MS = 1500;

/**
 * Keeps the signed-in user's public leaderboard entry (leaderboardEntries/{uid}) in sync with
 * their opt-in choice and their broker-synced trades. Mounted once for the lifetime of the app
 * shell (see JournalApp.tsx), same pattern as useJournalReminder, so a broker sync, an opt-in
 * toggle, or switching anonymous display all reach the leaderboard within a couple seconds —
 * no page reload, no separate "publish" step for the user to remember.
 *
 * Opting out (or never opting in) writes nothing and actively deletes any existing entry, so
 * "nobody's on it until they opt in" holds even for someone who opted in earlier and changed
 * their mind.
 */
export function useLeaderboardSync(trades: Trade[]): void {
  const { user, username, firebaseEnabled } = useAuth();
  const { settings } = useSettings();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!firebaseEnabled || !user) return;
    const uid = user.uid;

    if (!settings.leaderboardOptIn) {
      void removeLeaderboardEntry(uid);
      return;
    }

    timerRef.current = setTimeout(() => {
      void upsertLeaderboardEntry(uid, username || 'Trader', settings.leaderboardAnonymous, trades);
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, firebaseEnabled, username, settings.leaderboardOptIn, settings.leaderboardAnonymous, trades]);
}
