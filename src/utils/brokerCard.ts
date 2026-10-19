/**
 * What the broker card says. Pure, because every branch is a different promise about the account.
 */
export interface BrokerCardInput {
  /** Institution names from the last broker status this browser saw; empty when it saw none. */
  institutions: readonly string[];
  /** A trade in the journal came from a broker. */
  hasBrokerTrades: boolean;
  syncsPerDay: number;
  /** Today's syncs so far, or null while the entitlement is still loading. */
  syncsUsed: number | null;
  /** The latest sign of a sync (services/brokerStatusCache lastBrokerSync), or null. */
  syncedAt: number | null;
}

export interface BrokerCardState {
  connected: boolean;
  /** "Charles Schwab", "Charles Schwab, Robinhood", or "Your broker" when only the trades say one is linked. */
  name: string;
  /** The first institution, for its logo; null when none is known. */
  institution: string | null;
  /** Syncs left today and the day's allowance, or null when there is no allowance to state. */
  left: number | null;
  perDay: number | null;
  spent: boolean;
  syncedAt: number | null;
}

export function brokerCardState(input: BrokerCardInput): BrokerCardState {
  const names = [...new Set(input.institutions.map((n) => n.trim()).filter(Boolean))];
  const connected = names.length > 0 || input.hasBrokerTrades;
  const base = {
    connected,
    name: names.length > 0 ? names.join(', ') : 'Your broker',
    institution: names[0] ?? null,
    syncedAt: connected ? input.syncedAt : null,
  };

  // Nothing about the allowance while the count is unknown: "0 of 10 left" for the first second of
  // every visit would be a false alarm, and a plan without syncs has nothing to count.
  if (input.syncsPerDay <= 0 || input.syncsUsed === null) {
    return { ...base, left: null, perDay: null, spent: false };
  }
  const left = Math.max(0, input.syncsPerDay - input.syncsUsed);
  return { ...base, left, perDay: input.syncsPerDay, spent: left === 0 };
}
