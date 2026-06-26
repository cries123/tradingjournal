import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import type { BrokerConnection, BrokerIntegrationId, BrokerSyncRequest, BrokerSyncResult } from '../types/broker';
import type { ParsedTradeInput } from '../types';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

const INTEGRATIONS_COLLECTION = 'integrations';

interface StoredCredentials {
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
}

function integrationsDoc(uid: string, brokerId: BrokerIntegrationId) {
  return doc(getFirebaseDb(), 'users', uid, INTEGRATIONS_COLLECTION, brokerId);
}

function tokenHint(token: string): string {
  if (token.length <= 4) return '••••';
  return `••••${token.slice(-4)}`;
}

export async function loadBrokerConnections(uid: string): Promise<BrokerConnection[]> {
  if (!isFirebaseConfigured()) return [];
  const ids: BrokerIntegrationId[] = ['schwab', 'tos', 'robinhood'];
  const connections: BrokerConnection[] = [];

  for (const id of ids) {
    const snap = await getDoc(integrationsDoc(uid, id));
    if (!snap.exists()) continue;
    const data = snap.data() as BrokerConnection & { tokenHint?: string };
    connections.push({
      id: data.id ?? id,
      label: data.label ?? id,
      connectedAt: data.connectedAt,
      lastSyncAt: data.lastSyncAt,
      lastSyncError: data.lastSyncError,
      tokenHint: data.tokenHint,
      autoSync: data.autoSync ?? false,
    });
  }
  return connections;
}

export async function saveBrokerConnection(
  uid: string,
  brokerId: BrokerIntegrationId,
  connection: BrokerConnection,
  credentials: StoredCredentials,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Sign in required to connect brokers');

  await setDoc(integrationsDoc(uid, brokerId), {
    ...connection,
    id: brokerId,
    tokenHint: tokenHint(credentials.accessToken),
    credentials,
  });
}

export async function loadBrokerCredentials(
  uid: string,
  brokerId: BrokerIntegrationId,
): Promise<StoredCredentials | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(integrationsDoc(uid, brokerId));
  if (!snap.exists()) return null;
  const data = snap.data() as { credentials?: StoredCredentials };
  return data.credentials ?? null;
}

export async function disconnectBroker(uid: string, brokerId: BrokerIntegrationId): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await deleteDoc(integrationsDoc(uid, brokerId));
}

export async function syncBrokerTrades(
  uid: string,
  brokerId: BrokerIntegrationId,
  sinceDate?: string,
): Promise<{ trades: ParsedTradeInput[]; result: BrokerSyncResult }> {
  const creds = await loadBrokerCredentials(uid, brokerId);
  if (!creds?.accessToken) {
    throw new Error('Broker not connected — add your API token in Settings.');
  }

  const body: BrokerSyncRequest = {
    broker: brokerId,
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    accountId: creds.accountId,
    sinceDate,
  };

  const res = await fetch('/api/broker-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, userId: uid }),
  });

  const payload = (await res.json()) as BrokerSyncResult & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error ?? 'Broker sync failed');
  }

  const trades: ParsedTradeInput[] = payload.trades.map((t) => ({
    date: t.date,
    symbol: t.symbol,
    pnl: t.pnl,
    side: t.side,
    setup: t.setup ?? 'BROKER SYNC',
    notes: t.notes,
    fees: t.fees,
    quantity: t.quantity,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    assetClass: t.assetClass,
  }));

  const connectionSnap = await getDoc(integrationsDoc(uid, brokerId));
  if (connectionSnap.exists()) {
    const existing = connectionSnap.data() as BrokerConnection & { credentials?: StoredCredentials };
    await setDoc(integrationsDoc(uid, brokerId), {
      ...existing,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined,
    });
  }

  return { trades, result: payload };
}

export async function markBrokerSyncError(
  uid: string,
  brokerId: BrokerIntegrationId,
  message: string,
): Promise<void> {
  const snap = await getDoc(integrationsDoc(uid, brokerId));
  if (!snap.exists()) return;
  const existing = snap.data();
  await setDoc(integrationsDoc(uid, brokerId), {
    ...existing,
    lastSyncError: message,
    lastSyncAt: new Date().toISOString(),
  });
}

export function getBrokerOAuthUrl(brokerId: BrokerIntegrationId): string | null {
  const params = new URLSearchParams({ broker: brokerId });
  return `/api/broker-oauth-callback?${params.toString()}`;
}

export async function connectBrokerWithToken(
  uid: string,
  brokerId: BrokerIntegrationId,
  accessToken: string,
  opts?: { refreshToken?: string; accountId?: string; label?: string; autoSync?: boolean },
): Promise<BrokerConnection> {
  const connection: BrokerConnection = {
    id: brokerId,
    label: opts?.label ?? brokerId,
    connectedAt: new Date().toISOString(),
    autoSync: opts?.autoSync ?? true,
    tokenHint: tokenHint(accessToken),
  };

  await saveBrokerConnection(uid, brokerId, connection, {
    accessToken,
    refreshToken: opts?.refreshToken,
    accountId: opts?.accountId,
  });

  return connection;
}
