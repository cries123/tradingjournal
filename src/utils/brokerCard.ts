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
}

export interface BrokerCardState {
  connected: boolean;
  /** "Schwab", "Schwab, Robinhood", or "Your broker" when only the trades say one is linked. */
  name: string;
  /** "8 of 10 syncs left today", or null when there is no allowance to state. */
  allowance: string | null;
  allowanceSpent: boolean;
}

export function brokerCardState(input: BrokerCardInput): BrokerCardState {
  const names = [...new Set(input.institutions.map((n) => n.trim()).filter(Boolean))];
  const connected = names.length > 0 || input.hasBrokerTrades;
  const name = names.length > 0 ? names.join(', ') : 'Your broker';

  // No line at all while the count is unknown: "0 of 10 left" for the first second of every visit
  // would be a false alarm, and a plan without syncs has nothing to count.
  if (input.syncsPerDay <= 0 || input.syncsUsed === null) {
    return { connected, name, allowance: null, allowanceSpent: false };
  }
  const left = Math.max(0, input.syncsPerDay - input.syncsUsed);
  return {
    connected,
    name,
    allowance: `${left} of ${input.syncsPerDay} syncs left today`,
    allowanceSpent: left === 0,
  };
}
