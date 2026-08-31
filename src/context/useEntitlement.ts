import { createContext, useContext } from 'react';
import type { Feature, Tier, TierLimits } from '../config/tiers';
import type { EntitlementSnapshot } from '../services/entitlement';

/**
 * The EntitlementContext object and its hook, kept apart from the provider that fills it.
 *
 * Splitting them is what lets the provider file hot-reload: a module exporting both a
 * component and plain values is rebuilt wholesale on every edit, losing the state the
 * provider is holding. Everything importing useEntitlement keeps working unchanged.
 */
export interface EntitlementContextValue {
  tier: Tier;
  limits: TierLimits;
  status: EntitlementSnapshot['status'];
  /** 'admin' means grandfathered — no subscription to manage, so don't offer to cancel one. */
  source: EntitlementSnapshot['source'];
  currentPeriodEnd: string | null;
  usage: EntitlementSnapshot['usage'];
  loading: boolean;
  /** True only once a real answer has come back, so the UI can avoid flashing a locked state. */
  loaded: boolean;
  marketReplayLive: boolean;
  has: (feature: Feature) => boolean;
  refresh: () => Promise<void>;
  /** Adjusts the local counters after a request the server has already counted. */
  noteUsage: (patch: Partial<EntitlementSnapshot['usage']>) => void;
}

export const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used inside EntitlementProvider');
  return ctx;
}
