import { useEffect, useRef, useState } from 'react';
import type { Trade } from '../types';
import { findDuplicateTrades } from '../utils/duplicateTrades';

/**
 * Removes broker trades that were imported twice, automatically, once the journal has loaded.
 *
 * Background: an automatic broker sync shipped briefly and could fire while the journal was still
 * loading from Firestore, so it deduped against an empty list and re-imported the trader's whole
 * history as "new". That sync has been removed — syncing is manual again — and this repairs the
 * rows it already wrote.
 *
 * It runs without asking because the detection is provable rather than heuristic: a duplicate here
 * is two rows carrying the same broker sourceId in the same journal, which can only be the same
 * fill written twice (see utils/duplicateTrades.ts). Manually-logged trades have no sourceId and
 * are never candidates. There is also no partial-load hazard of the kind that caused the original
 * bug — a row is only ever deleted while a surviving copy of it is visible in the same list, so a
 * half-loaded journal can only ever cause this to do less, never to delete something it shouldn't.
 *
 * It reports what it removed so the journal isn't quietly editing itself behind the trader's back.
 */
export interface DuplicateCleanup {
  /** How many rows were removed this session, or null if nothing needed removing. */
  removed: number | null;
  /** Clears the receipt once the trader has seen it. */
  acknowledge: () => void;
}

export function useDuplicateCleanup(
  trades: Trade[],
  removeTrades: (ids: string[]) => Promise<void>,
  ready: boolean,
): DuplicateCleanup {
  const [removed, setRemoved] = useState<number | null>(null);
  // One pass per session. Without this the Firestore snapshot that lands after the delete would
  // re-enter the effect while the first pass was still in flight.
  const runningRef = useRef(false);
  const doneRef = useRef(false);
  const removeRef = useRef(removeTrades);

  useEffect(() => {
    removeRef.current = removeTrades;
  }, [removeTrades]);

  useEffect(() => {
    if (!ready || doneRef.current || runningRef.current) return;
    if (trades.length === 0) return;

    const { duplicates } = findDuplicateTrades(trades);
    if (duplicates.length === 0) return;

    runningRef.current = true;
    void (async () => {
      try {
        await removeRef.current(duplicates.map((t) => t.id));
        doneRef.current = true;
        setRemoved((prev) => (prev ?? 0) + duplicates.length);
      } catch (err) {
        // Leave doneRef false so opening the app again retries. A failed cleanup must not be
        // worse than no cleanup: the journal is exactly as it was.
        console.error('[duplicate-cleanup] failed:', err);
      } finally {
        runningRef.current = false;
      }
    })();
  }, [trades, ready]);

  return { removed, acknowledge: () => setRemoved(null) };
}
