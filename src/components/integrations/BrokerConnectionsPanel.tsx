import { useCallback, useEffect, useState } from 'react';
import { Link2, RefreshCw, Unplug } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BROKER_INTEGRATIONS, type BrokerConnection, type BrokerIntegrationId } from '../../types/broker';
import {
  connectBrokerWithToken,
  disconnectBroker,
  getBrokerOAuthUrl,
  loadBrokerConnections,
  markBrokerSyncError,
  syncBrokerTrades,
} from '../../services/brokerIntegrations';
import { BrokerLogo } from '../brokers/BrokerLogo';
import type { ParsedTradeInput } from '../../types';

interface BrokerConnectionsPanelProps {
  onTradesImported: (trades: ParsedTradeInput[]) => void;
}

export function BrokerConnectionsPanel({ onTradesImported }: BrokerConnectionsPanelProps) {
  const { user, firebaseEnabled } = useAuth();
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [connecting, setConnecting] = useState<BrokerIntegrationId | null>(null);
  const [syncing, setSyncing] = useState<BrokerIntegrationId | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const list = await loadBrokerConnections(user.uid);
    setConnections(list);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('broker_oauth');
    const err = params.get('broker_oauth_error');
    const broker = (params.get('broker') ?? 'schwab') as BrokerIntegrationId;
    const accessToken = params.get('access_token');

    if (err) {
      setMessage(decodeURIComponent(err));
      window.history.replaceState({}, '', '/app');
      return;
    }

    if (oauth && accessToken && user) {
      void connectBrokerWithToken(user.uid, broker, accessToken, {
        refreshToken: params.get('refresh_token') || undefined,
      }).then(() => {
        setMessage('Broker connected via OAuth.');
        void refresh();
      });
      window.history.replaceState({}, '', '/app');
    }
  }, [user, refresh]);

  const connectionFor = (id: BrokerIntegrationId) => connections.find((c) => c.id === id);

  const handleConnect = async (brokerId: BrokerIntegrationId) => {
    if (!user) {
      setMessage('Sign in to connect broker APIs.');
      return;
    }
    if (!tokenInput.trim()) {
      setMessage('Paste your API access token, or use OAuth when configured.');
      return;
    }

    setConnecting(brokerId);
    setMessage(null);
    try {
      await connectBrokerWithToken(user.uid, brokerId, tokenInput.trim(), {
        accountId: accountId.trim() || undefined,
        label: BROKER_INTEGRATIONS.find((b) => b.id === brokerId)?.name ?? brokerId,
      });
      setTokenInput('');
      setAccountId('');
      await refresh();
      setMessage('Broker connected. Tap Sync to import trades.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(null);
    }
  };

  const handleSync = async (brokerId: BrokerIntegrationId) => {
    if (!user) return;
    setSyncing(brokerId);
    setMessage(null);
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { trades, result } = await syncBrokerTrades(user.uid, brokerId, since);
      onTradesImported(trades);
      await refresh();
      setMessage(result.message ?? `Imported ${trades.length} trades`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      await markBrokerSyncError(user.uid, brokerId, msg);
      await refresh();
      setMessage(msg);
    } finally {
      setSyncing(null);
    }
  };

  const handleDisconnect = async (brokerId: BrokerIntegrationId) => {
    if (!user) return;
    await disconnectBroker(user.uid, brokerId);
    await refresh();
    setMessage('Broker disconnected.');
  };

  const oauthUrl = (id: BrokerIntegrationId) => getBrokerOAuthUrl(id);

  if (!firebaseEnabled) {
    return (
      <p className="text-xs text-text-secondary">
        Sign in with cloud sync to store broker credentials securely and enable automated sync.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{message}</p>
      )}

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs text-text-secondary mb-1 block">API access token</span>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Paste token from broker developer portal"
            className="input-field"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="text-xs text-text-secondary mb-1 block">Account ID (optional)</span>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="Schwab account hash if you have multiple accounts"
            className="input-field"
          />
        </label>
      </div>

      {BROKER_INTEGRATIONS.map((broker) => {
        const connected = connectionFor(broker.id);
        return (
          <div key={broker.id} className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-2">
            <BrokerLogo broker={broker.id === 'tos' ? 'thinkorswim' : broker.id} className="text-sm" />
            <p className="text-xs text-text-secondary">{broker.description}</p>

            {connected ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-emerald-400 uppercase tracking-wide">Connected {connected.tokenHint}</span>
                {connected.lastSyncAt && (
                  <span className="text-[10px] text-text-secondary">
                    Last sync {new Date(connected.lastSyncAt).toLocaleString()}
                  </span>
                )}
                {connected.lastSyncError && (
                  <span className="text-[10px] text-loss-bright">{connected.lastSyncError}</span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSync(broker.id)}
                  disabled={syncing === broker.id}
                  className="btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-1"
                >
                  <RefreshCw size={12} className={syncing === broker.id ? 'animate-spin' : ''} />
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisconnect(broker.id)}
                  className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1"
                >
                  <Unplug size={12} />
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleConnect(broker.id)}
                  disabled={connecting === broker.id}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  {connecting === broker.id ? 'Connecting…' : 'Connect with token'}
                </button>
                <a
                  href={oauthUrl(broker.id) ?? '#'}
                  onClick={(e) => {
                    if (!oauthUrl(broker.id)) {
                      e.preventDefault();
                      setMessage('OAuth requires server env vars — use API token for now.');
                    }
                  }}
                  className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1"
                >
                  <Link2 size={12} />
                  OAuth
                </a>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[10px] text-text-secondary">
        Tokens are stored in your private Firestore account. CSV and screenshot import still work without API access.
      </p>
    </div>
  );
}
