import { findBrokerEntryByName, normalizeBrokerName } from '../data/brokerRegistry';

/**
 * Maps whatever name a broker arrives under — a registry key, a SnapTrade institution name, or
 * something a person typed — onto the id used for its logo, and the name to display.
 *
 * Not in BrokerLogo.tsx, where it started: pages that only need the id call it without rendering
 * a logo, and a module exporting both a component and plain functions cannot be hot-reloaded.
 */
export function resolveBroker(input: string): { brokerId: string; name: string } | null {
  const norm = normalizeBrokerName(input);
  if (norm.includes('thinkorswim') || norm === 'tos') {
    return { brokerId: 'thinkorswim', name: 'thinkorswim' };
  }

  const entry = findBrokerEntryByName(input);
  if (entry) return { brokerId: entry.brokerId, name: entry.name };
  return null;
}

/** Just the logo id, for callers passing it straight to <BrokerLogo broker=...>. */
export function brokerIdFromName(name: string): string {
  return resolveBroker(name)?.brokerId ?? name;
}
