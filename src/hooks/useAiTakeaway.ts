import { useEffect, useRef, useState } from 'react';
import type { Trade } from '../types';
import type { JournalFactsOptions } from '../utils/journalFacts';
import { buildJournalFacts } from '../utils/journalFacts';
import { fetchAiTakeaway, hashTrades } from '../services/aiTakeaway';
import { useAuth } from '../context/useAuth';
import { isFirebaseConfigured } from '../lib/firebase';

/** Below this, any "pattern" is noise and the computed banner is the more honest one. */
const MIN_TRADES = 3;

/** How long the banner will wait for the model before falling back to the computed line. */
const HOLD_TIMEOUT_MS = 6000;

const CACHE_KEY = 'tc-ai-takeaway';

/*
 * One takeaway remembered per browser.
 *
 * The server already caches these, but a round trip is still a round trip, and the wait is exactly
 * when the banner has nothing true to show. Remembering the last answer means re-opening the month
 * you were just looking at renders it on the first paint — no hold, no swap. Keyed by uid, period
 * and the trade hash, so it is never shown against numbers it was not written about.
 */
function readCached(): { key: string; text: string | null } {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { key: '', text: null };
    const parsed = JSON.parse(raw) as { key?: unknown; text?: unknown };
    return typeof parsed.key === 'string' && (typeof parsed.text === 'string' || parsed.text === null)
      ? { key: parsed.key, text: parsed.text }
      : { key: '', text: null };
  } catch {
    return { key: '', text: null };
  }
}

function writeCached(key: string, text: string | null): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, text }));
  } catch {
    // Private mode, or storage full. The banner still works, it just holds again next time.
  }
}

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
export interface AiTakeaway {
  /** The model's read of this period, or null when there isn't one. */
  text: string | null;
  /** Whether an answer for the period on screen is still coming. */
  pending: boolean;
}

export function useAiTakeaway(
  trades: Trade[],
  periodKey: string,
  rules?: JournalFactsOptions['rules'],
): AiTakeaway {
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
  const [answer, setAnswer] = useState<{ key: string; text: string | null }>(() => readCached());
  const [timedOut, setTimedOut] = useState(false);
  const requestedRef = useRef<string>('');

  const uid = user?.uid ?? '';
  const enabled = Boolean(uid) && isFirebaseConfigured() && trades.length >= MIN_TRADES;
  const factsHash = enabled ? hashTrades(trades) : '';
  const requestKey = `${uid}:${periodKey}:${factsHash}`;

  useEffect(() => {
    if (!enabled) return;
    // Already answered — from the cache on first paint, or from a previous run. Nothing to fetch,
    // and nothing to hold for.
    if (answer.key === requestKey) return;
    if (requestedRef.current === requestKey) return;
    requestedRef.current = requestKey;
    setTimedOut(false);

    const facts = buildJournalFacts(trades, periodKey, { includeNotes: false, rules });
    if (!facts) return;

    /*
     * A ceiling on how long the banner will hold.
     *
     * Holding is only better than swapping while the wait is short. If the model is slow, the
     * network is bad, or the request never resolves, an indefinitely empty banner is worse than
     * the computed line — so after this the computed one renders and stays.
     */
    const timer = setTimeout(() => setTimedOut(true), HOLD_TIMEOUT_MS);

    const controller = new AbortController();
    void fetchAiTakeaway(facts, periodKey, factsHash, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setAnswer({ key: requestKey, text: result });
      writeCached(requestKey, result);
    });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // trades and rules are intentionally absent from the deps: factsHash already stands for the
    // trades, and depending on the array itself refetches on every render that rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled, periodKey, answer.key]);

  // Only shown when it answers the request currently on screen, so a takeaway about last month can
  // never appear beside this month's numbers while a new one is in flight.
  const text = enabled && answer.key === requestKey ? answer.text : null;

  return {
    text,
    /*
     * True while the answer for THIS request has not arrived yet.
     *
     * The banner uses it to hold rather than to show the computed line and swap a second later.
     * Replacing text under someone who has started reading is the "flash" — it reads as the app
     * correcting itself, and the first version of it was worse than saying nothing for a moment.
     */
    pending: enabled && answer.key !== requestKey && !timedOut,
  };
}
