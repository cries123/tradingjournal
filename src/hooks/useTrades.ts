import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useSettings } from '../context/useSettings';
import type { Filters, Trade } from '../types';
import {
  deleteTradeDoc,
  deleteTradesBatch,
  migrateLocalTrades,
  saveTrade,
  saveTradesBatch,
  subscribeTrades,
} from '../services/tradesFirestore';
import { syncUserTradeActivityFromTrades } from '../services/userTradeActivity';
import { clearLegacyTradesStorage, clearTrades, loadTrades, saveTrades } from '../utils/storage';
import { resolveTradeAccountId } from '../utils/accounts';
import { buildSampleTrades, isSampleTrade } from '../utils/sampleData';
import { tradeTags } from '../utils/tradeHelpers';
import { describeJournalWriteError } from '../utils/journalWriteError';

/** 'error' means the cloud journal is not working — shown, never guessed at silently. */
export type SyncStatus = 'loading' | 'local' | 'cloud' | 'syncing' | 'error';

export function useTrades() {
  const { user, firebaseEnabled, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const [trades, setTrades] = useState<Trade[]>([]);
  /** Example trades shown in the UI only — never persisted or synced. */
  const [sampleTrades, setSampleTrades] = useState<Trade[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  /** Why the journal stopped saving, in words a trader can act on. */
  const [syncError, setSyncError] = useState<string | null>(null);
  const migratedRef = useRef(false);
  const activitySyncedRef = useRef(false);
  const activeUidRef = useRef<string | null>(null);

  const [filters, setFilters] = useState<Filters>({
    symbol: '',
    setup: '',
    side: '',
    tag: '',
  });

  useEffect(() => {
    migratedRef.current = false;
    activitySyncedRef.current = false;
    activeUidRef.current = user?.uid ?? null;
    // Clearing state before the fetch or subscription below. This is the external-system sync
    // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
    // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
    // rule rather than to fix a bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrades([]);
    setSyncStatus('loading');

    /*
     * "Not signed in" is only true once Firebase has said so.
     *
     * While auth resolves, user is null — which is indistinguishable from a signed-out visitor if
     * you only look at the value. Falling through to the local branch here set the status to
     * 'local', which is a settled state, so the dashboard stopped waiting and rendered the empty
     * "Start your journal" screen at a signed-in user with a full journal. A second later the
     * listener arrived and replaced it. Staying in 'loading' until auth has actually decided is
     * the whole fix: the skeleton is already there, it was just never given the chance to show.
     */
    if (authLoading) return;

    if (!firebaseEnabled || !user) {
      setTrades(loadTrades(null));
      setSyncStatus('local');
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const uid = user.uid;

    const setup = async () => {
      clearLegacyTradesStorage();

      if (!migratedRef.current) {
        const anonymousTrades = loadTrades(null).filter((t) => !isSampleTrade(t));
        const migrated = await migrateLocalTrades(uid, anonymousTrades);
        migratedRef.current = true;
        if (migrated > 0) {
          clearTrades(null);
        }
        if (cancelled || activeUidRef.current !== uid) return;
        // Deliberately stays 'loading' rather than moving to 'syncing' here. Both mean work is in
        // progress, but 'syncing' is a settled state everywhere else — it is what a save looks
        // like, over a journal that is already on screen — so the dashboard stops waiting on it
        // and renders whatever it has, which at this point is nothing. The first snapshot below
        // is the moment there is something true to show.
      }

      unsubscribe = subscribeTrades(
        uid,
        (cloudTrades) => {
          if (cancelled || activeUidRef.current !== uid) return;
          setTrades(cloudTrades);
          saveTrades(cloudTrades, uid);
          setSyncStatus('cloud');
          setSyncError(null);
          if (!activitySyncedRef.current) {
            activitySyncedRef.current = true;
            // Bookkeeping for the admin list. Caught, because an unguarded floating promise here
            // rejects into nothing — which is how a denied write became an anonymous unhandled
            // rejection in the error feed, attributed to the listener that merely started it.
            void syncUserTradeActivityFromTrades(uid, cloudTrades).catch((error: unknown) => {
              console.warn('[trades] could not update activity bookkeeping.', error);
            });
          }
        },
        (error) => {
          // Without this the listen failure is silent: the callback simply stops firing and the
          // journal keeps showing its last snapshot as though it were current.
          if (cancelled || activeUidRef.current !== uid) return;
          setSyncStatus('error');
          setSyncError(describeJournalWriteError(error));
        },
      );
    };

    void setup();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user, firebaseEnabled, authLoading]);

  useEffect(() => {
    if (syncStatus === 'local') {
      saveTrades(trades, null);
    }
  }, [trades, syncStatus]);

  const combinedTrades = useMemo(
    () => (sampleTrades.length > 0 ? [...trades, ...sampleTrades] : trades),
    [trades, sampleTrades],
  );

  const accountTrades = useMemo(() => {
    const activeId = settings.activeAccountId;
    return combinedTrades.filter((t) => resolveTradeAccountId(t.accountId) === activeId);
  }, [combinedTrades, settings.activeAccountId]);

  const filteredTrades = useMemo(() => {
    return accountTrades.filter((trade) => {
      if (filters.symbol && trade.symbol !== filters.symbol) return false;
      if (filters.setup && trade.setup !== filters.setup) return false;
      if (filters.side && trade.side !== filters.side) return false;
      if (filters.tag && !tradeTags(trade).includes(filters.tag)) return false;
      return true;
    });
  }, [accountTrades, filters]);

  const symbols = useMemo(
    () => [...new Set(accountTrades.map((t) => t.symbol))].sort(),
    [accountTrades],
  );

  const setups = useMemo(
    () => [...new Set(accountTrades.flatMap((t) => tradeTags(t)))].sort(),
    [accountTrades],
  );

  const loadSampleData = useCallback(() => {
    setSampleTrades(buildSampleTrades(settings.activeAccountId));
  }, [settings.activeAccountId]);

  const clearSampleData = useCallback(() => {
    setSampleTrades([]);
  }, []);

  /**
   * Every write to the cloud journal goes through here.
   *
   * These were `setSyncStatus('syncing')` followed by a bare await. A rejection left the status on
   * 'syncing' forever — a spinner that never resolves and never explains itself — and, where the
   * caller did not await, became an unhandled promise rejection instead of anything a trader could
   * see. It still rethrows: the caller decides what its own UI says, this decides what the journal
   * as a whole reports.
   */
  const runCloudWrite = useCallback(async <T,>(op: () => Promise<T>): Promise<T> => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      return await op();
    } catch (error) {
      setSyncStatus('error');
      setSyncError(describeJournalWriteError(error));
      throw error;
    }
  }, []);

  const persistTrade = useCallback(
    async (trade: Trade) => {
      setSampleTrades([]);
      if (user && firebaseEnabled) {
        await runCloudWrite(() => saveTrade(user.uid, trade));
      } else {
        setTrades((prev) => {
          const next = [...prev.filter((t) => t.id !== trade.id), trade];
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled, runCloudWrite],
  );

  const withAccount = useCallback(
    (trade: Omit<Trade, 'id'>): Omit<Trade, 'id'> => ({
      ...trade,
      accountId: trade.accountId ?? settings.activeAccountId,
    }),
    [settings.activeAccountId],
  );

  const addTrade = useCallback(
    (trade: Omit<Trade, 'id'>) => {
      const newTrade: Trade = { ...withAccount(trade), id: crypto.randomUUID() };
      void persistTrade(newTrade);
    },
    [persistTrade, withAccount],
  );

  const addTrades = useCallback(
    async (newTrades: Omit<Trade, 'id'>[]) => {
      setSampleTrades([]);
      const withIds = newTrades.map((trade) => ({
        ...withAccount(trade),
        id: crypto.randomUUID(),
      }));
      if (user && firebaseEnabled) {
        await runCloudWrite(() => saveTradesBatch(user.uid, withIds));
      } else {
        setTrades((prev) => {
          const next = [...prev, ...withIds];
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled, withAccount, runCloudWrite],
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      if (user && firebaseEnabled) {
        await runCloudWrite(() => deleteTradeDoc(user.uid, id));
      } else {
        setTrades((prev) => {
          const next = prev.filter((t) => t.id !== id);
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled, runCloudWrite],
  );

  /**
   * Removes many trades in one go — used by the duplicate cleanup.
   *
   * Separate from calling deleteTrade in a loop because that would fire a Firestore write per
   * trade and re-render the journal after each one; a journal with hundreds of duplicates would
   * spend a minute visibly shrinking row by row.
   */
  const removeTrades = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      if (user && firebaseEnabled) {
        await runCloudWrite(() => deleteTradesBatch(user.uid, ids));
      } else {
        const toRemove = new Set(ids);
        setTrades((prev) => {
          const next = prev.filter((t) => !toRemove.has(t.id));
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled, runCloudWrite],
  );

  const updateTrade = useCallback(
    async (trade: Trade) => {
      await persistTrade(trade);
    },
    [persistTrade],
  );

  /** Restore trades from a backup — merges by trade id, preserving ids. */
  const restoreTrades = useCallback(
    async (backupTrades: Trade[]) => {
      if (backupTrades.length === 0) return;
      if (user && firebaseEnabled) {
        await runCloudWrite(() => saveTradesBatch(user.uid, backupTrades));
      } else {
        setTrades((prev) => {
          const byId = new Map(prev.map((t) => [t.id, t]));
          for (const trade of backupTrades) {
            byId.set(trade.id, trade);
          }
          const next = [...byId.values()];
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled, runCloudWrite],
  );

  /**
   * Wipes the active journal.
   *
   * Deletes through the chunked batch writer rather than firing one request per trade. The old
   * version did `Promise.all(ids.map(deleteTradeDoc))`, which opens as many concurrent writes as
   * you have trades — fine for a journal of thirty, and a wall of throttled requests for a journal
   * of several hundred. Worse, a single rejection failed the whole Promise.all, so a big journal
   * would half-clear and then look like the button simply hadn't worked.
   *
   * Throws on failure so the caller can say something. Silently doing nothing is the one outcome a
   * destructive button must never have.
   */
  const clearAll = useCallback(async () => {
    const activeId = settings.activeAccountId;
    const toRemove = trades
      .filter((t) => resolveTradeAccountId(t.accountId) === activeId)
      .map((t) => t.id);

    if (toRemove.length === 0) return;

    if (user && firebaseEnabled) {
      // Was a hand-rolled version of runCloudWrite that reset the status to 'cloud' on failure —
      // honest about the spinner, but it reported a journal that had just refused a delete as
      // healthy. runCloudWrite says what actually happened.
      await runCloudWrite(() => deleteTradesBatch(user.uid, toRemove));
    } else {
      const removing = new Set(toRemove);
      setTrades((prev) => {
        const next = prev.filter((t) => !removing.has(t.id));
        saveTrades(next, null);
        return next;
      });
    }
  }, [user, firebaseEnabled, settings.activeAccountId, trades, runCloudWrite]);

  return {
    trades: filteredTrades,
    allTrades: accountTrades,
    /** Every trade across all journals/accounts — for full backups. */
    everyTrade: trades,
    filters,
    setFilters,
    symbols,
    setups,
    addTrade,
    addTrades,
    updateTrade,
    deleteTrade,
    removeTrades,
    restoreTrades,
    clearAll,
    syncStatus,
    syncError,
    sampleActive: sampleTrades.length > 0,
    loadSampleData,
    clearSampleData,
  };
}
