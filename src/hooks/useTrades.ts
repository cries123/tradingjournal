import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Filters, Trade } from '../types';
import { SAMPLE_TRADES } from '../utils/sampleData';
import { loadTrades, saveTrades } from '../utils/storage';

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>(() => {
    const stored = loadTrades();
    return stored.length > 0 ? stored : SAMPLE_TRADES;
  });

  const [filters, setFilters] = useState<Filters>({
    symbol: '',
    setup: '',
    side: '',
  });

  useEffect(() => {
    saveTrades(trades);
  }, [trades]);

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

  const addTrade = useCallback((trade: Omit<Trade, 'id'>) => {
    const newTrade: Trade = { ...trade, id: crypto.randomUUID() };
    setTrades((prev) => [...prev, newTrade]);
  }, []);

  const deleteTrade = useCallback((id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const resetToSample = useCallback(() => {
    setTrades(SAMPLE_TRADES);
  }, []);

  const clearAll = useCallback(() => {
    setTrades([]);
  }, []);

  return {
    trades: filteredTrades,
    allTrades: trades,
    filters,
    setFilters,
    symbols,
    setups,
    addTrade,
    deleteTrade,
    resetToSample,
    clearAll,
  };
}
