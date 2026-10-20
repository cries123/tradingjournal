import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Trade } from '../types';
import type { Bar } from '../utils/marketReplay';
import { expand, pathItemFor, pathKey, type PathItem } from '../utils/tradePathBars';
import { afterExitView, type AfterExitView } from '../utils/tradePath';
import { fetchTradePaths, PATH_ITEMS_PER_REQUEST } from '../services/tradePaths';
import { reportErrorSilently } from '../services/errorReporting';

/**
 * The stored minute bars behind a set of trades, fetched once per contract-day and kept for the
 * visit.
 *
 * Module-level rather than per component, so the Trades panel, the trade sheet and the Performance
 * screen share one copy and moving between them asks nothing twice. A day that was not stored is
 * remembered as such until market replay opens it (forgetUnstored), and is then asked for again.
 */

const cache = new Map<string, Bar[] | null>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Market replay just stored a day: ask again about the ones that were missing. */
export function forgetUnstored(): void {
  let changed = false;
  for (const [key, bars] of cache) {
    if (bars === null) {
      cache.delete(key);
      changed = true;
    }
  }
  if (changed) notify();
}

export interface TradePaths {
  /** The trade's bars; null when its day was never opened in replay; undefined while unknown or not measurable. */
  barsFor: (trade: Trade) => Bar[] | null | undefined;
  /** Some of these trades' days are still being asked about. */
  loading: boolean;
}

export function useTradePaths(trades: Trade[], enabled: boolean): TradePaths {
  const [snapshot, setSnapshot] = useState<ReadonlyMap<string, Bar[] | null>>(() => new Map(cache));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sync = () => setSnapshot(new Map(cache));
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const items = useMemo(() => {
    const byKey = new Map<string, PathItem>();
    for (const t of trades) {
      const item = pathItemFor(t);
      if (item && !byKey.has(pathKey(item))) byKey.set(pathKey(item), item);
    }
    return byKey;
  }, [trades]);

  useEffect(() => {
    // After a failure, no retry loop: the next visit to the screen asks again.
    if (!enabled || failed) return;
    const missing = [...items.entries()].filter(([key]) => !snapshot.has(key) && !cache.has(key) && !inFlight.has(key));
    if (missing.length === 0) return;
    missing.forEach(([key]) => inFlight.add(key));
    let live = true;
    const run = async () => {
      try {
        for (let i = 0; i < missing.length; i += PATH_ITEMS_PER_REQUEST) {
          const chunk = missing.slice(i, i + PATH_ITEMS_PER_REQUEST);
          const answers = await fetchTradePaths(chunk.map(([, item]) => item));
          for (const a of answers) {
            const key = chunk[a.index]?.[0];
            if (key) cache.set(key, a.stored ? (a.bars ? expand(a.bars) : []) : null);
          }
        }
      } catch (err) {
        reportErrorSilently(err, 'promise', 'trade-paths');
        if (live) setFailed(true);
      } finally {
        missing.forEach(([key]) => inFlight.delete(key));
        notify();
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [items, enabled, snapshot, failed]);

  const barsFor = useCallback(
    (trade: Trade) => {
      const item = pathItemFor(trade);
      return item ? snapshot.get(pathKey(item)) : undefined;
    },
    [snapshot],
  );

  const loading = enabled && !failed && [...items.keys()].some((key) => !snapshot.has(key));
  return { barsFor, loading };
}

/** One trade's "after you closed it", for the trade panel and the trade sheet. Null when not measuring. */
export function useAfterExitView(trade: Trade | null, enabled: boolean): AfterExitView | null {
  const list = useMemo(() => (trade ? [trade] : []), [trade]);
  const paths = useTradePaths(list, enabled);
  return enabled && trade ? afterExitView(trade, paths.barsFor(trade), paths.loading) : null;
}
