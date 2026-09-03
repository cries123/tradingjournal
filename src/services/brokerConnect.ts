import type { ParsedTradeInput } from '../types';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import type { BrokerRegistryKey } from '../data/brokerRegistry';

export type SupportedBroker = BrokerRegistryKey;

export interface BrokerAccountSummary {
  id: string;
  name: string | null;
  institutionName: string;
  authorizationId: string;
  status?: unknown;
}

export interface BrokerStatus {
  registered: boolean;
  accounts: BrokerAccountSummary[];
}

/** An error that also reports where the caller's sync allowance stands, when the server said. */
export class BrokerApiError extends Error {
  syncsRemaining?: number;
  syncsPerDay?: number;
  /** The underlying reason, sent only to the site admin. Undefined for everyone else. */
  detail?: string;

  constructor(message: string, syncsRemaining?: number, syncsPerDay?: number, detail?: string) {
    super(message);
    this.name = 'BrokerApiError';
    this.syncsRemaining = syncsRemaining;
    this.syncsPerDay = syncsPerDay;
    this.detail = detail;
  }
}

async function brokerApiPost<T>(payload: Record<string, unknown>): Promise<T> {
  if (!isFirebaseConfigured()) {
    throw new Error('Sign in to connect a broker — broker sync stores your connection securely on your account.');
  }

  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new Error('Sign in to connect a broker');
  }

  const token = await user.getIdToken();
  const res = await fetch('/api/broker-connect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as T & {
    error?: string;
    detail?: string;
    syncsRemaining?: number;
    syncsPerDay?: number;
  };
  if (!res.ok) {
    // A failed sync still spends the allowance unless the server refunded it, and the badge used
    // to have no way of learning that — it only updated on success, so a run of failures drained
    // the meter invisibly and every error still said the user had syncs left. The counts ride
    // along on the failure so the caller can correct the display either way.
    throw new BrokerApiError(
      data.error ?? 'Request failed',
      data.syncsRemaining,
      data.syncsPerDay,
      data.detail,
    );
  }
  return data;
}

/** Whether the site owner has configured SnapTrade credentials at all. Safe to call unauthenticated. */
export async function checkBrokerConnectAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/broker-status');
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

/** Starts a broker connection: returns the SnapTrade connection portal URL to open/redirect to. */
export async function startBrokerConnect(broker: SupportedBroker): Promise<{ redirectURI: string }> {
  return brokerApiPost({ action: 'connect', broker });
}

/** Lists the caller's connected broker accounts (empty + registered:false if none yet). */
export async function fetchBrokerStatus(): Promise<BrokerStatus> {
  return brokerApiPost({ action: 'status' });
}

/**
 * Pulls activity for one connected account and maps it into ready-to-save trades. With no
 * startDate/endDate, pulls the account's full known history (not just a recent window), paginating
 * through everything SnapTrade has on file.
 */
export async function syncBrokerAccount(
  accountId: string,
  startDate?: string,
  endDate?: string,
): Promise<{
  trades: ParsedTradeInput[];
  activityCount: number;
  totalActivityCount: number;
  truncated: boolean;
  /** Closing fills whose opening trade is older than the history the brokerage returned. */
  unmatchedCloses?: number;
  /** Positions opened by a sale with no prior purchase — a real short, or a pre-existing holding. */
  assumedShorts?: number;
  /** Symbol-days where buys and sells had no time of day, so their pairing follows feed order. */
  inferredOrderDays?: number;
  /** Rows skipped by activity type: dividends, transfers, splits, fees. */
  ignored?: Record<string, number>;
  /** Fills whose fee was reported as a negative number; treated as a cost. */
  negativeFees?: number;
  /** Syncs left today on this plan, counted server-side. */
  syncsRemaining?: number;
  syncsPerDay?: number;
}> {
  return brokerApiPost({ action: 'sync', accountId, startDate, endDate });
}

/** Disconnects a broker connection. */
export async function disconnectBroker(authorizationId: string): Promise<void> {
  await brokerApiPost({ action: 'disconnect', authorizationId });
}
