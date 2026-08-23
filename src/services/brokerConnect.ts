import type { ParsedTradeInput } from '../types';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

export type SupportedBroker = 'SCHWAB' | 'ROBINHOOD' | 'WEBULL';

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

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
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
): Promise<{ trades: ParsedTradeInput[]; activityCount: number; totalActivityCount: number; truncated: boolean }> {
  return brokerApiPost({ action: 'sync', accountId, startDate, endDate });
}

/** Disconnects a broker connection. */
export async function disconnectBroker(authorizationId: string): Promise<void> {
  await brokerApiPost({ action: 'disconnect', authorizationId });
}
