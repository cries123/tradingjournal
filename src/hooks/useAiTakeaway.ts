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
  /*
   * Stored with the request it answered rather than on its own.
   *
   * The previous version kept a bare string and cleared it from the effect on every key change, to
   * stop a takeaway written about one period being shown beside another period's numbers. That
   * worked, but clearing state synchronously inside an effect is a cascading render — and it is
   * unnecessary, because "is this text about what I am looking at" is answerable by comparing the
   * key it arrived with. Now nothing is set from the effect body at all; the only setState is in
   * the fetch callback, and a mismatched key simply renders as nothing.
   */
  const [answer, setAnswer] = useState<{ key: string; text: string | null }>({ key: '', text: null });
  const requestedRef = useRef<string>('');

  const uid = user?.uid ?? '';
  const enabled = Boolean(uid) && isFirebaseConfigured() && trades.length >= MIN_TRADES;
  const factsHash = enabled ? hashTrades(trades) : '';
  const requestKey = `${uid}:${periodKey}:${factsHash}`;

  useEffect(() => {
    if (!enabled) return;
    if (requestedRef.current === requestKey) return;
    requestedRef.current = requestKey;

    const facts = buildJournalFacts(trades, periodKey, { includeNotes: false, rules });
    if (!facts) return;

    const controller = new AbortController();
    void fetchAiTakeaway(facts, periodKey, factsHash, controller.signal).then((result) => {
      if (!controller.signal.aborted) setAnswer({ key: requestKey, text: result });
    });

    return () => controller.abort();
    // trades and rules are intentionally absent from the deps: factsHash already stands for the
    // trades, and depending on the array itself refetches on every render that rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled, periodKey]);

  // Only shown when it answers the request currently on screen, so a takeaway about last month can
  // never appear beside this month's numbers while a new one is in flight.
  return enabled && answer.key === requestKey ? answer.text : null;
}
