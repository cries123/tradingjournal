import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { BrokerLogo } from './BrokerLogo';
import { useAuth } from '../../context/AuthContext';
import {
  checkBrokerConnectAvailable,
  disconnectBroker,
  fetchBrokerStatus,
  startBrokerConnect,
  syncBrokerAccount,
  type BrokerAccountSummary,
  type SupportedBroker,
} from '../../services/brokerConnect';
import type { Trade } from '../../types';

interface BrokerCardCopy {
  key: SupportedBroker;
  name: string;
  brokerId: 'schwab' | 'robinhood';
  /** Lowercase substring to match against SnapTrade's institution_name for this broker's accounts.
   *  Keep in sync with the needle used server-side in snaptradeClient.ts's resolveBrokerSlug. */
  matchNeedle: string;
  access: string;
  steps: string[];
  note: string;
}

const BROKER_COPY: BrokerCardCopy[] = [
  {
    key: 'SCHWAB',
    name: 'Charles Schwab & thinkorswim',
    brokerId: 'schwab',
    matchNeedle: 'schwab',
    access: 'Read & sync',
    steps: [
      'Click Connect — a secure SnapTrade window opens in a new tab.',
      'Choose Charles Schwab and log in with your Schwab credentials, on Schwab’s own site. Trend Chasers never sees your password.',
      'Approve read access, then close that tab and come back here.',
      'Click Refresh, pick your account, and Sync trades to pull in your history.',
    ],
    note: 'thinkorswim accounts are Schwab accounts under the hood, so this same connection covers both.',
  },
  {
    key: 'ROBINHOOD',
    name: 'Robinhood',
    brokerId: 'robinhood',
    matchNeedle: 'robinhood',
    access: 'Read-only',
    steps: [
      'Click Connect — a secure SnapTrade window opens in a new tab.',
      'Choose Robinhood and sign in there. Robinhood has no official trading API, so SnapTrade brokers the connection — your credentials go to SnapTrade’s secure portal, never to our servers.',
      'Approve read access, then close that tab and come back here.',
      'Click Refresh, pick your account, and Sync trades to pull in your history.',
    ],
    note: 'Robinhood connections are read-only — this can pull your trade history, but can’t place trades.',
  },
];

interface BrokerConnectContentProps {
  onBack: () => void;
  onImportTrades: (trades: Trade[]) => void;
  /** Already-saved trades, used to skip re-importing anything a previous sync already pulled in. */
  existingTrades: Trade[];
}

export function BrokerConnectContent({ onBack, onImportTrades, existingTrades }: BrokerConnectContentProps) {
  const { user, loading, firebaseEnabled } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ registered: boolean; accounts: BrokerAccountSummary[] } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectingBroker, setConnectingBroker] = useState<SupportedBroker | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const canConnect = firebaseEnabled && !loading && Boolean(user);

  useEffect(() => {
    void checkBrokerConnectAvailable().then(setAvailable);
  }, []);

  const refreshStatus = async () => {
    if (!canConnect) return;
    setStatusLoading(true);
    setError(null);
    try {
      const next = await fetchBrokerStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load broker connections');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (canConnect && available) void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConnect, available]);

  const handleConnect = async (broker: SupportedBroker) => {
    setError(null);
    setConnectingBroker(broker);
    try {
      const { redirectURI } = await startBrokerConnect(broker);
      window.open(redirectURI, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start connection');
    } finally {
      setConnectingBroker(null);
    }
  };

  const handleSync = async (account: BrokerAccountSummary) => {
    setError(null);
    setSyncMessage(null);
    setSyncingAccountId(account.id);
    try {
      const { trades, truncated } = await syncBrokerAccount(account.id);
      const known = new Set(existingTrades.map((t) => t.sourceId).filter(Boolean));
      const freshTrades = trades.filter((t) => !t.sourceId || !known.has(t.sourceId));
      const label = account.name ?? account.institutionName;

      if (freshTrades.length === 0) {
        setSyncMessage(
          trades.length === 0
            ? `No trade activity found for ${label}.`
            : `You're up to date — all ${trades.length} trade${trades.length === 1 ? '' : 's'} from ${label} ${trades.length === 1 ? 'was' : 'were'} already imported.`,
        );
        return;
      }

      const withIds: Trade[] = freshTrades.map((t, i) => ({
        ...t,
        id: `snaptrade_${account.id}_${Date.now()}_${i}`,
      }));
      onImportTrades(withIds);
      const skipped = trades.length - freshTrades.length;
      setSyncMessage(
        `Imported ${freshTrades.length} trade${freshTrades.length === 1 ? '' : 's'} from ${label}` +
          (skipped > 0 ? ` (${skipped} already up to date).` : '.') +
          (truncated
            ? ' This account has more activity than one sync can pull in — the oldest history was left out.'
            : ''),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleDisconnect = async (account: BrokerAccountSummary) => {
    setError(null);
    try {
      await disconnectBroker(account.authorizationId);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect');
    }
  };

  const accountsForInstitution = (needle: string) =>
    (status?.accounts ?? []).filter((a) => a.institutionName?.toLowerCase().includes(needle));

  return (
    <div className="pb-6">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Connect a broker</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Sync trades automatically
        </h1>
        <p className="text-text-secondary text-base leading-relaxed max-w-2xl mb-8">
          Connect Schwab or Robinhood through SnapTrade, a broker-data connection provider, to pull your
          trade history in automatically. Your broker credentials go directly to your broker or to
          SnapTrade&apos;s secure portal — never to Trend Chasers. You can disconnect anytime. Prefer not
          to connect? You can still log trades manually.
        </p>

        {!firebaseEnabled ? (
          <div className="panel-card p-6 text-sm text-text-secondary mb-6">
            Broker connect requires cloud sync to be configured for this deployment. Ask the site owner to
            set up Firebase.
          </div>
        ) : !canConnect ? (
          <div className="panel-card p-6 text-sm text-text-secondary mb-6">
            Sign in to connect a broker — your connection is tied securely to your account.
          </div>
        ) : available === false ? (
          <div className="panel-card p-6 text-sm text-text-secondary mb-6">
            Broker connect isn&apos;t set up on this deployment yet. The site owner needs to add
            SnapTrade API keys (SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY).
          </div>
        ) : null}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300 mb-6">
            {error}
          </div>
        )}

        {syncMessage && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300 mb-6 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            {syncMessage}
          </div>
        )}

        <div className="space-y-5">
          {BROKER_COPY.map((broker) => {
            const accounts = accountsForInstitution(broker.matchNeedle);
            const isConnected = accounts.length > 0;

            return (
              <article key={broker.key} className="panel-card p-5 md:p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <BrokerLogo broker={broker.brokerId} />
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-bg-tertiary/60 text-text-secondary text-[10px] font-semibold uppercase tracking-wide border border-border/50">
                    {broker.access}
                  </span>
                </div>

                {isConnected ? (
                  <div className="space-y-2 mb-4">
                    {accounts.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                          <span className="font-medium">{a.name ?? a.institutionName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSync(a)}
                            disabled={syncingAccountId === a.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border/60 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors disabled:opacity-50 focus-ring"
                          >
                            {syncingAccountId === a.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <RefreshCw size={13} />
                            )}
                            Sync trades
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDisconnect(a)}
                            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-red-400 transition-colors focus-ring rounded px-1"
                          >
                            <Unlink size={13} />
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleConnect(broker.key)}
                    disabled={!canConnect || available !== true || connectingBroker === broker.key}
                    className="inline-flex items-center gap-2 btn-primary text-sm px-4 py-2 mb-4 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {connectingBroker === broker.key ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Link2 size={15} />
                    )}
                    Connect {broker.name.split(' ')[0]}
                  </button>
                )}

                <details className="text-sm">
                  <summary className="cursor-pointer text-text-secondary hover:text-text-primary transition-colors select-none">
                    How the connection works
                  </summary>
                  <ol className="mt-3 space-y-2 list-decimal list-inside text-text-secondary">
                    {broker.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-text-secondary/80 flex items-start gap-1.5">
                    <ExternalLink size={12} className="mt-0.5 shrink-0" />
                    {broker.note}
                  </p>
                </details>
              </article>
            );
          })}
        </div>

        {canConnect && available && (
          <button
            type="button"
            onClick={() => void refreshStatus()}
            disabled={statusLoading}
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors focus-ring rounded px-1"
          >
            {statusLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh connections
          </button>
        )}
      </div>
    </div>
  );
}
