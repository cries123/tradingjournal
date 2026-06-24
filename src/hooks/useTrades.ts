import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Filters, Trade } from '../types';
import {
  deleteAllTrades,
  deleteTradeDoc,
  migrateLocalTrades,
  saveTrade,
  saveTradesBatch,
  subscribeTrades,
} from '../services/tradesFirestore';
import { loadTrades, saveTrades } from '../utils/storage';

export type SyncStatus = 'loading' | 'local' | 'cloud' | 'syncing';

export function useTrades() {
  const { user, firebaseEnabled } = useAuth();
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

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      if (filters.symbol && trade.symbol !== filters.symbol) return false;
      if (filters.setup && trade.setup !== filters.setup) return false;
      if (filters.side && trade.side !== filters.side) return false;
      return true;
    });
  }, [trades, filters]);

  const symbols = useMemo(
    () => [...new Set(trades.map((t) => t.symbol))].sort(),
    [trades],
  );

  const setups = useMemo(
    () => [...new Set(trades.map((t) => t.setup).filter(Boolean))].sort() as string[],
    [trades],
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

  const addTrade = useCallback(
    (trade: Omit<Trade, 'id'>) => {
      const newTrade: Trade = { ...trade, id: crypto.randomUUID() };
      void persistTrade(newTrade);
    },
    [persistTrade],
  );

  const addTrades = useCallback(
    async (newTrades: Omit<Trade, 'id'>[]) => {
      const withIds = newTrades.map((trade) => ({ ...trade, id: crypto.randomUUID() }));
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
    [user, firebaseEnabled],
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

  const clearAll = useCallback(async () => {
    if (user && firebaseEnabled) {
      setSyncStatus('syncing');
      await deleteAllTrades(user.uid);
    } else {
      setTrades([]);
      saveTrades([]);
    }
  }, [user, firebaseEnabled]);

  return {
    trades: filteredTrades,
    allTrades: trades,
    filters,
    setFilters,
    symbols,
    setups,
    addTrade,
    addTrades,
    deleteTrade,
    clearAll,
    syncStatus,
  };
}
