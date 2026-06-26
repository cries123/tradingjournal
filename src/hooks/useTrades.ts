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
import { loadTrades, saveTrades } from '../utils/storage';
import { resolveTradeAccountId } from '../utils/accounts';

export type SyncStatus = 'loading' | 'local' | 'cloud' | 'syncing';

export function useTrades() {
  const { user, firebaseEnabled } = useAuth();
  const { settings } = useSettings();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const migratedRef = useRef(false);

  const [filters, setFilters] = useState<Filters>({
    symbol: '',
    setup: '',
    side: '',
  });

  useEffect(() => {
    migratedRef.current = false;

    if (!firebaseEnabled || !user) {
      setTrades(loadTrades());
      setSyncStatus('local');
      return;
    }

    setSyncStatus('loading');
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      if (!migratedRef.current) {
        const local = loadTrades();
        const migrated = await migrateLocalTrades(user.uid, local);
        migratedRef.current = true;
        if (migrated > 0) {
          setSyncStatus('syncing');
        }
      }

      unsubscribe = subscribeTrades(user.uid, (cloudTrades) => {
        setTrades(cloudTrades);
        saveTrades(cloudTrades);
        setSyncStatus('cloud');
      });
    };

    void setup();
    return () => unsubscribe?.();
  }, [user, firebaseEnabled]);

  useEffect(() => {
    if (syncStatus === 'local') {
      saveTrades(trades);
    }
  }, [trades, syncStatus]);

  const accountTrades = useMemo(() => {
    const activeId = settings.activeAccountId;
    return trades.filter((t) => resolveTradeAccountId(t.accountId) === activeId);
  }, [trades, settings.activeAccountId]);

  const filteredTrades = useMemo(() => {
    return accountTrades.filter((trade) => {
      if (filters.symbol && trade.symbol !== filters.symbol) return false;
      if (filters.setup && trade.setup !== filters.setup) return false;
      if (filters.side && trade.side !== filters.side) return false;
      return true;
    });
  }, [accountTrades, filters]);

  const symbols = useMemo(
    () => [...new Set(accountTrades.map((t) => t.symbol))].sort(),
    [accountTrades],
  );

  const setups = useMemo(
    () => [...new Set(accountTrades.map((t) => t.setup).filter(Boolean))].sort() as string[],
    [accountTrades],
  );

  const persistTrade = useCallback(
    async (trade: Trade) => {
      if (user && firebaseEnabled) {
        setSyncStatus('syncing');
        await saveTrade(user.uid, trade);
      } else {
        setTrades((prev) => {
          const next = [...prev.filter((t) => t.id !== trade.id), trade];
          saveTrades(next);
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
          saveTrades(next);
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
          saveTrades(next);
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
        saveTrades(next);
        return next;
      });
    }
  }, [user, firebaseEnabled, settings.activeAccountId, trades]);

  return {
    trades: filteredTrades,
    allTrades: accountTrades,
    filters,
    setFilters,
    symbols,
    setups,
    addTrade,
    addTrades,
    updateTrade,
    deleteTrade,
    clearAll,
    syncStatus,
  };
}
