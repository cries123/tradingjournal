import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import type { Filters, Trade } from '../types';
import {
  deleteTradeDoc,
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

export type SyncStatus = 'loading' | 'local' | 'cloud' | 'syncing';

export function useTrades() {
  const { user, firebaseEnabled } = useAuth();
  const { settings } = useSettings();
  const [trades, setTrades] = useState<Trade[]>([]);
  /** Example trades shown in the UI only — never persisted or synced. */
  const [sampleTrades, setSampleTrades] = useState<Trade[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
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
    setTrades([]);
    setSyncStatus('loading');

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
        if (migrated > 0) {
          setSyncStatus('syncing');
        }
      }

      unsubscribe = subscribeTrades(uid, (cloudTrades) => {
        if (cancelled || activeUidRef.current !== uid) return;
        setTrades(cloudTrades);
        saveTrades(cloudTrades, uid);
        setSyncStatus('cloud');
        if (!activitySyncedRef.current) {
          activitySyncedRef.current = true;
          void syncUserTradeActivityFromTrades(uid, cloudTrades);
        }
      });
    };

    void setup();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user, firebaseEnabled]);

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

  const persistTrade = useCallback(
    async (trade: Trade) => {
      setSampleTrades([]);
      if (user && firebaseEnabled) {
        setSyncStatus('syncing');
        await saveTrade(user.uid, trade);
      } else {
        setTrades((prev) => {
          const next = [...prev.filter((t) => t.id !== trade.id), trade];
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled],
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
        setSyncStatus('syncing');
        await saveTradesBatch(user.uid, withIds);
      } else {
        setTrades((prev) => {
          const next = [...prev, ...withIds];
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled, withAccount],
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      if (user && firebaseEnabled) {
        setSyncStatus('syncing');
        await deleteTradeDoc(user.uid, id);
      } else {
        setTrades((prev) => {
          const next = prev.filter((t) => t.id !== id);
          saveTrades(next, null);
          return next;
        });
      }
    },
    [user, firebaseEnabled],
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
        setSyncStatus('syncing');
        await saveTradesBatch(user.uid, backupTrades);
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
    [user, firebaseEnabled],
  );

  const clearAll = useCallback(async () => {
    const activeId = settings.activeAccountId;
    const toRemove = new Set(
      trades.filter((t) => resolveTradeAccountId(t.accountId) === activeId).map((t) => t.id),
    );

    if (user && firebaseEnabled) {
      setSyncStatus('syncing');
      await Promise.all([...toRemove].map((id) => deleteTradeDoc(user.uid, id)));
    } else {
      setTrades((prev) => {
        const next = prev.filter((t) => !toRemove.has(t.id));
        saveTrades(next, null);
        return next;
      });
    }
  }, [user, firebaseEnabled, settings.activeAccountId, trades]);

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
    restoreTrades,
    clearAll,
    syncStatus,
    sampleActive: sampleTrades.length > 0,
    loadSampleData,
    clearSampleData,
  };
}
