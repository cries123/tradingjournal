import { useEffect, useRef, useState } from 'react';
import type { Trade } from '../types';
import type { JournalFactsOptions } from '../utils/journalFacts';
import { buildJournalFacts } from '../utils/journalFacts';
import { fetchAiTakeaway, hashTrades } from '../services/aiTakeaway';
import { useAuth } from '../context/AuthContext';
import { isFirebaseConfigured } from '../lib/firebase';

/** Below this, any "pattern" is noise and the computed banner is the more honest one. */
const MIN_TRADES = 3;

/**
 * The AI read of the current period, or null while it is unavailable.
 *
 * Null is the normal state, not an error state: signed out, too few trades, provider down, daily
 * cap spent. The dashboard renders its computed takeaway whenever this is null, so the banner is
 * never empty and never has to show a failure to someone who was looking at their calendar.
 *
 * Notes are deliberately never sent. The assistant asks permission to include them because a
 * trader opens it on purpose and can see what they are agreeing to; this runs on its own the moment
 * the dashboard loads. An opt-in given to one is not consent for the other, and a takeaway does not
 * need someone's private writing to say a Tuesday cost them two thirds of the month.
 */
export function useAiTakeaway(
  trades: Trade[],
  periodKey: string,
  rules?: JournalFactsOptions['rules'],
): string | null {
  const { user } = useAuth();
  const [text, setText] = useState<string | null>(null);
  const requestedRef = useRef<string>('');

  const uid = user?.uid ?? '';
  const enabled = Boolean(uid) && isFirebaseConfigured() && trades.length >= MIN_TRADES;
  const factsHash = enabled ? hashTrades(trades) : '';
  const requestKey = `${uid}:${periodKey}:${factsHash}`;

  useEffect(() => {
    if (!enabled) {
      setText(null);
      return;
    }

    // The trade set this text was written about has changed; showing it beside different numbers
    // would be worse than falling back to the computed line.
    setText(null);
    if (requestedRef.current === requestKey) return;
    requestedRef.current = requestKey;

    const facts = buildJournalFacts(trades, periodKey, { includeNotes: false, rules });
    if (!facts) return;

    const controller = new AbortController();
    void fetchAiTakeaway(facts, periodKey, factsHash, controller.signal).then((result) => {
      if (!controller.signal.aborted) setText(result);
    });

    return () => controller.abort();
    // trades and rules are intentionally absent from the deps: factsHash already stands for the
    // trades, and depending on the array itself refetches on every render that rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled, periodKey]);

  return text;
}
