import { useCallback, useEffect, useRef, useState } from 'react';
import type { Trade } from '../types';
import { useAuth } from '../context/AuthContext';
import { getLastSyncedAt, isSyncDue, runAutoSync } from '../services/autoBrokerSync';

export type AutoSyncState = 'idle' | 'syncing' | 'done' | 'failed';

export interface AutoBrokerSync {
  state: AutoSyncState;
  /** Epoch ms of the last successful sync on this device, or null if never. */
  lastSyncedAt: number | null;
  /** How many trades the most recent run brought in. */
  imported: number;
  /** Kick off a sync now, ignoring the interval. Backs the manual "Sync now" affordance. */
  syncNow: () => void;
}

/**
 * Runs a broker sync when the journal opens, if the data is stale enough to be worth it.
 *
 * Deliberately not on a timer: a setInterval would keep firing in a tab left open all day,
 * burning SnapTrade calls for a user who isn't looking. Opening the app is the moment the data
 * actually needs to be current, so that's when we check.
 */
export function useAutoBrokerSync(
  existingTrades: Trade[],
  onImportTrades: (trades: Trade[]) => void,
): AutoBrokerSync {
  const { user, firebaseEnabled } = useAuth();
  const uid = user?.uid ?? null;

  const [state, setState] = useState<AutoSyncState>('idle');
  const [imported, setImported] = useState(0);
  /** Set after a run in this session; before that we fall back to what's on disk. */
  const [syncedThisSession, setSyncedThisSession] = useState<number | null>(null);

  // Read straight from storage during render rather than mirroring it into state via an effect.
  // It's a synchronous read of a single key, so it's cheap, and keeping it out of state avoids a
  // setState-in-effect cascade just to learn a value we can look up.
  const lastSyncedAt = syncedThisSession ?? (uid ? getLastSyncedAt(uid) : null);

  // Latest-value refs so the effect doesn't re-run every time a trade is added — which, since a
  // sync adds trades, would otherwise re-trigger the sync that just finished. Assigned in an
  // effect, not during render: a render can be thrown away, and mutating a ref in one is unsafe.
  const tradesRef = useRef(existingTrades);
  const importRef = useRef(onImportTrades);
  useEffect(() => {
    tradesRef.current = existingTrades;
    importRef.current = onImportTrades;
  });

  /** Guards against React's double-invoked effects in dev, and against overlapping runs. */
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (!uid || runningRef.current) return;
    runningRef.current = true;
    setState('syncing');

    try {
      const result = await runAutoSync({ uid, existingTrades: tradesRef.current });

      if (result === null) {
        // No broker connected — not a failure, just nothing to do.
        setState('idle');
        return;
      }

      if (result.newTrades.length > 0) importRef.current(result.newTrades);
      setImported(result.newTrades.length);
      setSyncedThisSession(getLastSyncedAt(uid));
      setState(result.syncedAccounts === 0 ? 'failed' : 'done');
    } catch {
      setState('failed');
    } finally {
      runningRef.current = false;
    }
  }, [uid]);

  useEffect(() => {
    if (!firebaseEnabled || !uid) return;
    if (!isSyncDue(uid)) return;
    void run();
  }, [firebaseEnabled, uid, run]);

  const syncNow = useCallback(() => void run(), [run]);

  return { state, lastSyncedAt, imported, syncNow };
}
