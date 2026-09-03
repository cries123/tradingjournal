import { EntitlementContext, type EntitlementContextValue } from './useEntitlement';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './useAuth';
import {
  fetchEntitlement,
  FREE_SNAPSHOT,
  type EntitlementSnapshot,
} from '../services/entitlement';
import { MARKET_REPLAY_LIVE, tierHas, type Feature } from '../config/tiers';



/**
 * The signed-in user's plan, loaded once per session and refreshed on demand.
 *
 * Deliberately a single fetch rather than a Firestore listener: the usage counters aren't
 * client-readable by design, and this app has already been taken down once by Firestore read
 * quota — a live listener per user for a value that changes a few times a month would be the
 * wrong trade.
 *
 * Nothing here is a security boundary. Every limit is also enforced server-side; this exists so
 * the UI can show the right thing instead of letting someone click into a refusal.
 */
export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(FREE_SNAPSHOT);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Guards against a slow response for a previous user overwriting the current one's plan.
  const requestFor = useRef<string | null>(null);

  const load = useCallback(async (uid: string | null) => {
    requestFor.current = uid;
    if (!uid) {
      setSnapshot(FREE_SNAPSHOT);
      setLoaded(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const next = await fetchEntitlement();
      if (requestFor.current === uid) setSnapshot(next);
    } catch {
      // Fail closed to free — the same direction the server fails — rather than showing paid
      // features that would then be refused.
      if (requestFor.current === uid) setSnapshot(FREE_SNAPSHOT);
    } finally {
      if (requestFor.current === uid) {
        setLoaded(true);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    // Clearing state before the fetch or subscription below. This is the external-system sync
    // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
    // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
    // rule rather than to fix a bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(user?.uid ?? null);
  }, [authLoading, user?.uid, load]);

  const refresh = useCallback(async () => {
    await load(user?.uid ?? null);
  }, [load, user?.uid]);

  const noteUsage = useCallback((patch: Partial<EntitlementSnapshot['usage']>) => {
    setSnapshot((prev) => ({ ...prev, usage: { ...prev.usage, ...patch } }));
  }, []);

  const value = useMemo<EntitlementContextValue>(
    () => ({
      tier: snapshot.tier,
      limits: snapshot.limits,
      status: snapshot.status,
      source: snapshot.source,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      complimentaryUntil: snapshot.complimentaryUntil ?? null,
      usage: snapshot.usage,
      loading,
      loaded,
      marketReplayLive: snapshot.marketReplayLive ?? MARKET_REPLAY_LIVE,
      has: (feature: Feature) => tierHas(snapshot.tier, feature),
      refresh,
      noteUsage,
    }),
    [snapshot, loading, loaded, refresh, noteUsage],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

