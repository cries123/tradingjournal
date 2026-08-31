import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { BrokerLogo } from './BrokerLogo';
import { useEntitlement } from '../../context/EntitlementContext';
import { TIER_PLANS } from '../../config/tiers';
import { useAuth } from '../../context/AuthContext';
import {
  BrokerApiError,
  checkBrokerConnectAvailable,
  disconnectBroker,
  fetchBrokerStatus,
  startBrokerConnect,
  syncBrokerAccount,
  type BrokerAccountSummary,
  type SupportedBroker,
} from '../../services/brokerConnect';
import {
  BROKER_REGISTRY,
  isBrokerDown,
  matchesBrokerEntry,
  type BrokerRegistryEntry,
} from '../../data/brokerRegistry';
import type { Trade } from '../../types';
import { dedupeIncomingTrades } from '../../utils/duplicateTrades';

interface BrokerCardCopy {
  key: SupportedBroker;
  name: string;
  /** Short form for the "Connect X" button — falls back to the full name when not set. */
  shortName?: string;
  brokerId: string;
  entry: BrokerRegistryEntry;
  access: string;
  steps: string[];
  note: string;
}

/** Hand-tuned copy for the first three brokers (shipped before this list became registry-driven —
 *  see src/data/brokerRegistry.ts). Every other broker gets the templated copy below, which is
 *  accurate but generic; swap in bespoke copy here as it's worth writing for a given broker. */
const CUSTOM_COPY: Partial<Record<string, { name: string; shortName?: string; access: string; steps: string[]; note: string }>> = {
  SCHWAB: {
    name: 'Charles Schwab & thinkorswim',
    shortName: 'Schwab',
    access: 'Read & sync',
    steps: [
      'Click Connect — a secure SnapTrade window opens in a new tab.',
      'Choose Charles Schwab and log in with your Schwab credentials, on Schwab’s own site. Trend Chasers never sees your password.',
      'Approve read access, then close that tab and come back here.',
      'Click Refresh, pick your account, and Sync trades to pull in your history.',
    ],
    note: 'thinkorswim accounts are Schwab accounts under the hood, so this same connection covers both.',
  },
  ROBINHOOD: {
    name: 'Robinhood',
    access: 'Read-only',
    steps: [
      'Click Connect — a secure SnapTrade window opens in a new tab.',
      'Choose Robinhood and sign in there. Robinhood has no official trading API, so SnapTrade brokers the connection — your credentials go to SnapTrade’s secure portal, never to our servers.',
      'Approve read access, then close that tab and come back here.',
      'Click Refresh, pick your account, and Sync trades to pull in your history.',
    ],
    note: 'Robinhood connections are read-only — this can pull your trade history, but can’t place trades.',
  },
  WEBULL: {
    name: 'Webull',
    access: 'Read-only',
    steps: [
      'Click Connect — a secure SnapTrade window opens in a new tab.',
      'Choose Webull and sign in there. SnapTrade brokers the connection — your credentials go to SnapTrade’s secure portal, never to our servers.',
      'Approve read access, then close that tab and come back here.',
      'Click Refresh, pick your account, and Sync trades to pull in your history.',
    ],
    note: 'Webull’s own login step currently asks for your Webull Trade PIN — that’s Webull’s own authentication method, not a Trend Chasers requirement, and this connection still only requests read access.',
  },
};

function defaultSteps(name: string): string[] {
  return [
    'Click Connect — a secure SnapTrade window opens in a new tab.',
    `Choose ${name} and sign in there. SnapTrade brokers the connection — your credentials go to SnapTrade’s secure portal (or ${name}’s own site), never to Trend Chasers.`,
    'Approve read access, then close that tab and come back here.',
    'Click Refresh, pick your account, and Sync trades to pull in your history.',
  ];
}

const BROKER_COPY: BrokerCardCopy[] = BROKER_REGISTRY.map((entry) => {
  const custom = CUSTOM_COPY[entry.key];
  return {
    key: entry.key,
    entry,
    name: custom?.name ?? entry.name,
    shortName: custom?.shortName,
    brokerId: entry.brokerId,
    access: custom?.access ?? entry.access,
    steps: custom?.steps ?? defaultSteps(entry.name),
    note: custom?.note ?? `This is a read-only connection — it can pull your ${entry.name} trade history, but can’t place trades.`,
  };
});

interface BrokerConnectContentProps {
  onBack: () => void;
  onImportTrades: (trades: Trade[]) => void;
  /** Already-saved trades, used to skip re-importing anything a previous sync already pulled in. */
  existingTrades: Trade[];
  /**
   * False while the journal is still loading from Firestore.
   *
   * Load-bearing. Dedupe compares against `existingTrades`, so syncing before the journal has
   * arrived compares against an empty list and re-imports the trader's entire history. That is
   * exactly how the first duplication incident happened on the automatic path; the Sync button is
   * the same hazard with a person's finger on it, so it gets the same gate.
   */
  journalReady?: boolean;
}

export function BrokerConnectContent({
  onBack,
  onImportTrades,
  existingTrades,
  journalReady = true,
}: BrokerConnectContentProps) {
  const { user, loading, firebaseEnabled } = useAuth();
  const { noteUsage, limits, tier, usage, refresh } = useEntitlement();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ registered: boolean; accounts: BrokerAccountSummary[] } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectingBroker, setConnectingBroker] = useState<SupportedBroker | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The underlying reason, when the server judged this caller to be the site admin. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const canConnect = firebaseEnabled && !loading && Boolean(user);

  useEffect(() => {
    void checkBrokerConnectAvailable().then(setAvailable);
  }, []);

  // The entitlement is fetched once at sign-in and then only patched locally, so a tab left open —
  // or syncs spent on another device — leaves this screen showing a count that was true hours ago.
  // This is the one screen where that number decides whether someone presses the button, so it is
  // re-read on the way in.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Records a failure along with the reason, when the server sent one. */
  const reportError = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setErrorDetail(err instanceof BrokerApiError && err.detail ? err.detail : null);
  };

  const refreshStatus = async () => {
    if (!canConnect) return;
    setStatusLoading(true);
    setError(null);
    try {
      const next = await fetchBrokerStatus();
      setStatus(next);
    } catch (err) {
      reportError(err, 'Could not load broker connections');
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
      reportError(err, 'Could not start connection');
    } finally {
      setConnectingBroker(null);
    }
  };

  const handleSync = async (account: BrokerAccountSummary) => {
    if (!journalReady) {
      setError('Still loading your journal — give it a second, then sync.');
      return;
    }

    setError(null);
    setErrorDetail(null);
    setSyncMessage(null);
    setSyncingAccountId(account.id);
    try {
      const { trades, truncated, syncsRemaining, syncsPerDay } = await syncBrokerAccount(account.id);
      // The server has already spent one of today's syncs by the time this returns, so the meter
      // is updated from its answer rather than guessed at.
      if (typeof syncsRemaining === 'number' && typeof syncsPerDay === 'number') {
        noteUsage({ syncsUsed: Math.max(0, syncsPerDay - syncsRemaining), syncsRemaining });
      }

      // See dedupeIncomingTrades for why the rules live in one place rather than here.
      const { fresh: freshTrades, unidentified: skippedUnidentified } = dedupeIncomingTrades(
        trades,
        existingTrades,
      );

      const label = account.name ?? account.institutionName;

      if (freshTrades.length === 0) {
        setSyncMessage(
          trades.length === 0
            ? `No trade activity found for ${label}.`
            : `You're up to date — all ${trades.length} trade${trades.length === 1 ? '' : 's'} from ${label} ${trades.length === 1 ? 'was' : 'were'} already imported.`,
        );
        return;
      }

      if (skippedUnidentified > 0) {
        // Rare, and worth saying out loud rather than silently dropping someone's fills.
        console.warn(
          `[broker-sync] skipped ${skippedUnidentified} trade(s) with no source id from ${label}.`,
        );
      }

      const withIds: Trade[] = freshTrades.map(
        (t, i) =>
          ({
            ...t,
            id: `snaptrade_${account.id}_${Date.now()}_${i}`,
          }) as Trade,
      );
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
      // A failed sync usually still costs one. The server now says how many are left even when it
      // fails — and says so after refunding, when the failure was an outage rather than a rejected
      // call — so the meter tracks reality instead of freezing at whatever it read on page load.
      if (err instanceof BrokerApiError && typeof err.syncsRemaining === 'number') {
        const perDay = err.syncsPerDay ?? limits.syncsPerDay;
        noteUsage({
          syncsUsed: Math.max(0, perDay - err.syncsRemaining),
          syncsRemaining: err.syncsRemaining,
        });
      }
      reportError(err, 'Sync failed');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleDisconnect = async (account: BrokerAccountSummary) => {
    setError(null);
    setErrorDetail(null);
    try {
      await disconnectBroker(account.authorizationId);
      await refreshStatus();
    } catch (err) {
      reportError(err, 'Could not disconnect');
    }
  };

  const accountsForInstitution = (entry: BrokerRegistryEntry) =>
    (status?.accounts ?? []).filter((a) => matchesBrokerEntry(a.institutionName, entry));

  return (
    <div className="pb-6">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <p className="text-xs uppercase tracking-widest text-accent font-medium mb-3">Connect a broker</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Import trades from your broker
        </h1>
        <p className="text-text-secondary text-base leading-relaxed max-w-2xl mb-8">
          Connect any of the brokers below through SnapTrade, a broker-data connection provider, and
          pull your trade history in with one tap — no typing it out. Your broker credentials go
          directly to your broker or to SnapTrade&apos;s secure portal — never to Trend Chasers. You
          can disconnect anytime. Prefer not to connect? You can still log trades manually.
        </p>
        <p className="text-sm text-text-secondary leading-relaxed max-w-2xl mb-8 rounded-xl border border-border/60 bg-bg-tertiary/40 px-4 py-3">
          <span className="font-semibold text-text-primary">Syncing is on your say-so.</span>{' '}
          Trend Chasers never pulls from your broker on its own — press{' '}
          <span className="font-medium text-text-primary">Sync</span> on an account below whenever
          you want the latest fills. Re-syncing is safe: trades you already have are recognised and
          skipped, never added twice.
        </p>

        {/* Shown from the plan, not from a count of what's on screen: someone who has downgraded
            still sees the connections they made, and the honest number is what their plan allows
            now — otherwise a refused Connect looks like a bug. */}
        {limits.brokers > 0 && (
          <p className="text-sm text-text-secondary max-w-2xl mb-8 -mt-4">
            {TIER_PLANS[tier].name} includes{' '}
            <span className="text-text-primary font-medium">
              {limits.brokers} broker connection{limits.brokers === 1 ? '' : 's'}
            </span>{' '}
            and{' '}
            <span className="text-text-primary font-medium">
              {limits.syncsPerDay} sync{limits.syncsPerDay === 1 ? '' : 's'} a day
            </span>
            {usage.syncsRemaining < limits.syncsPerDay && (
              <> — {usage.syncsRemaining} left today</>
            )}
            .
          </p>
        )}

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
            {errorDetail && (
              // Admin-only, decided server-side. Monospace because this is upstream error text
              // meant to be copied into a support thread, not read as prose.
              <p className="mt-2 pt-2 border-t border-red-500/20 font-mono text-[11px] leading-relaxed text-red-300/70 break-words">
                {errorDetail}
              </p>
            )}
          </div>
        )}

        {syncMessage && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent mb-6 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            {syncMessage}
          </div>
        )}

        <div className="space-y-5">
          {BROKER_COPY.map((broker) => {
            const accounts = accountsForInstitution(broker.entry);
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
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 size={14} className="text-accent shrink-0" />
                          <span className="font-medium">{a.name ?? a.institutionName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSync(a)}
                            disabled={syncingAccountId === a.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border/60 hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-50 focus-ring"
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
                  <>
                  {broker.entry.status && (
                    /* Above the button, not below it: a greyed-out control with the reason
                       underneath is a puzzle, and the reason is the only useful thing here. */
                    <div
                      className={`mb-3 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${
                        broker.entry.status.kind === 'down'
                          ? 'border-amber-500/30 bg-amber-500/[0.07] text-amber-200/90'
                          : 'border-border bg-bg-tertiary/40 text-text-secondary'
                      }`}
                    >
                      <span className="font-semibold">
                        {broker.entry.status.kind === 'down' ? 'Temporarily unavailable' : 'Degraded'}
                      </span>
                      <span className="mx-1.5 opacity-40">·</span>
                      {broker.entry.status.message}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleConnect(broker.key)}
                    disabled={
                      !canConnect ||
                      available !== true ||
                      connectingBroker === broker.key ||
                      isBrokerDown(broker.entry)
                    }
                    className="inline-flex items-center gap-2 btn-primary text-sm px-4 py-2 mb-4 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {connectingBroker === broker.key ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Link2 size={15} />
                    )}
                    Connect {broker.shortName ?? broker.name}
                  </button>
                  </>
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
