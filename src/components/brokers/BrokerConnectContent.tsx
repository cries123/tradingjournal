import { useEffect, useMemo, useState } from 'react';
import { syncStartDate } from '../../utils/syncWindow';
import { manualSyncTradeId } from '../../utils/brokerTradeIds';
import { describeSyncResult } from '../../utils/syncOutcomeCopy';
import { readCachedBrokerStatus, writeCachedBrokerStatus } from '../../services/brokerStatusCache';
import { describeEvent, type JournalEvent } from '../../utils/journalEvents';
import { SyncHistory } from './SyncHistory';
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { PageFrame } from '../layout/PageFrame';
import { BrokerLogo } from './BrokerLogo';
import { useEntitlement } from '../../context/useEntitlement';
import { StartTrialButton } from '../plan/StartTrialButton';
import { goToPricing } from '../../utils/navigateToPath';
import { TRIAL_DAYS } from '../../config/trial';
import { brokersLabel, syncsLabel, TIER_PLANS } from '../../config/tiers';
import { useAuth } from '../../context/useAuth';
import {
  BrokerApiError,
  isReportableBrokerFailure,
  checkBrokerConnectAvailable,
  disconnectBroker,
  fetchBrokerStatus,
  fetchSyncHistory,
  startBrokerConnect,
  syncBrokerAccount,
  type BrokerAccountSummary,
  type BrokerStatus,
  type SupportedBroker,
} from '../../services/brokerConnect';
import {
  applyBrokerStatusOverrides,
  type BrokerStatusOverrides,
} from '../../data/brokerStatusOverrides';
import { subscribeToBrokerStatus } from '../../services/brokerStatus';
import {
  BROKER_REGISTRY,
  isBrokerDown,
  matchesBrokerEntry,
  type BrokerRegistryEntry,
} from '../../data/brokerRegistry';
import type { Trade } from '../../types';
import { dedupeIncomingTrades } from '../../utils/duplicateTrades';
import { describeJournalWriteError } from '../../utils/journalWriteError';
import { reportErrorSilently } from '../../services/errorReporting';
import { describeSyncGaps } from '../../utils/syncGaps';

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

function buildBrokerCopy(registry: typeof BROKER_REGISTRY): BrokerCardCopy[] {
  return registry.map((entry) => {
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
}

interface BrokerConnectContentProps {
  onBack: () => void;
  /**
   * Returns a promise, and it is awaited.
   *
   * This was typed `=> void` while the implementation was async, so the call below was a floating
   * promise: the "Imported N trades" message was shown before the write had happened and whether
   * or not it succeeded, and a failure rejected into nothing instead of into the catch a few lines
   * further down. A trader whose journal could not accept the write saw a success message, a sync
   * deducted from their daily allowance, and no trades.
   */
  onImportTrades: (trades: Trade[]) => void | Promise<void>;
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

  /* Availability comes from Firestore so it can be flipped from the admin panel without a deploy.
     Live, because a broker coming back up mid-session should unlock the card without a reload. */
  const [statusOverrides, setStatusOverrides] = useState<BrokerStatusOverrides>({});

  useEffect(() => subscribeToBrokerStatus(setStatusOverrides), []);

  const brokerCopy = useMemo(
    () => buildBrokerCopy(applyBrokerStatusOverrides(statusOverrides)),
    [statusOverrides],
  );
  const { noteUsage, limits, tier, usage, refresh, trialAvailable } = useEntitlement();
  const [available, setAvailable] = useState<boolean | null>(null);
  /*
   * Starts from the last answer this browser saw, so the accounts are on screen at once.
   *
   * The live status is a cold serverless function plus a SnapTrade round trip — four or five
   * seconds, during which this screen drew nothing and a trader who connected Schwab last week saw
   * no Schwab. The list only changes from this screen (connect, disconnect), so the previous answer
   * is almost always the current one; it is shown immediately and replaced when the live one lands.
   * The user may still be resolving on the first render, so the effect below hydrates it too.
   */
  const [status, setStatus] = useState<{ registered: boolean; accounts: BrokerAccountSummary[] } | null>(() =>
    user ? readCachedBrokerStatus(user.uid) : null,
  );
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectingBroker, setConnectingBroker] = useState<SupportedBroker | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  /** What the sync could not match, shown under the success message. */
  const [syncNotes, setSyncNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** The underlying reason, when the server judged this caller to be the site admin. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  /** The trader's own sync history, loaded with the status and again after each sync. */
  const [history, setHistory] = useState<JournalEvent[] | null>(null);

  const loadHistory = () => {
    fetchSyncHistory()
      .then(setHistory)
      .catch((err: unknown) => reportErrorSilently(err, 'promise', 'broker-sync-history'));
  };

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

  /**
   * Shows a failure to the trader, and — new — tells us about the ones worth knowing.
   *
   * This function used to be called `reportError` and reported nothing: it set two pieces of React
   * state and that was all. The file imports the real reporter and used it in exactly one place,
   * for a journal write that failed after a successful pull, so the rare case was visible and the
   * common one was not. Every failed sync, every failed connect and every failed disconnect went
   * only to the person it happened to.
   *
   * Renamed to what it does. The reporting is now explicit and filtered — see
   * isReportableBrokerFailure for why a broker outage must not become a row per user per attempt.
   */
  const showError = (err: unknown, fallback: string, scope: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setErrorDetail(err instanceof BrokerApiError && err.detail ? err.detail : null);
    if (isReportableBrokerFailure(err)) reportErrorSilently(err, 'promise', scope);
  };

  const refreshStatus = async (): Promise<BrokerStatus | null> => {
    if (!canConnect) return null;
    loadHistory();
    setStatusLoading(true);
    setError(null);
    try {
      const next = await fetchBrokerStatus();
      setStatus(next);
      if (user) writeCachedBrokerStatus(user.uid, next);
      return next;
    } catch (err) {
      showError(err, 'Could not load broker connections', 'broker-status');
      return null;
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!canConnect || !available || !user) return;
    // The cached list first, if the first render ran before the user had resolved — see the state
    // above. Syncing from an external store, which is what the rule allows an effect to do.
    const cached = readCachedBrokerStatus(user.uid);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setStatus((current) => current ?? cached);
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConnect, available]);

  const handleConnect = async (broker: SupportedBroker) => {
    setError(null);
    setConnectingBroker(broker);
    try {
      const { redirectURI } = await startBrokerConnect(broker);
      window.open(redirectURI, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showError(err, 'Could not start connection', 'broker-connect');
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
    setSyncNotes([]);
    setSyncingAccountId(account.id);
    // One clock read for the window and for the ids of what it brings back.
    const startedAt = new Date();
    try {
      const {
        trades, truncated, syncsRemaining, syncsPerDay, syncCredits, activityCount,
        unmatchedCloses, assumedShorts, inferredOrderDays, ignored, negativeFees,
        openPositions, orientationAssumed, windowReason, syncRefundNotice,
        /*
         * A window, not the whole account.
         *
         * This passed nothing, so every press re-pulled the entire history — up to 25 serial
         * pages for somebody checking today’s fills. Length is what broke it: the longest
         * request in the app is the one that loses its body when a phone locks mid-flight, and
         * a lost reply still cost the trader a sync.
         *
         * Undefined on a first sync, so a new connection still pulls everything.
         */
      } = await syncBrokerAccount(
        account.id,
        syncStartDate(existingTrades, account.id, startedAt),
      );
      // The server has already spent one of today's syncs by the time this returns, so the meter
      // is updated from its answer rather than guessed at. Bonus syncs ride inside the remaining
      // count, so they come out before the day's own allowance is worked back.
      if (typeof syncsRemaining === 'number' && typeof syncsPerDay === 'number') {
        const bonus = syncCredits ?? 0;
        noteUsage({
          syncsUsed: Math.max(0, syncsPerDay - (syncsRemaining - bonus)),
          syncsRemaining,
          syncCredits: bonus,
        });
      }

      // See dedupeIncomingTrades for why the rules live in one place rather than here.
      const { fresh: freshTrades, unidentified: skippedUnidentified } = dedupeIncomingTrades(
        trades,
        existingTrades,
      );

      const label = account.name ?? account.institutionName;

      /*
       * The notes first, on every path. They used to be set only after a successful import, so the
       * outcome that needed them most — activity came back and none of it paired — got "No trade
       * activity found" and nothing else, while the server had already worked out exactly why.
       */
      setSyncNotes(describeSyncGaps({
        unmatchedCloses, assumedShorts, inferredOrderDays, ignored, negativeFees, openPositions, orientationAssumed,
      }));
      const outcome = {
        label,
        activityCount: activityCount ?? trades.length * 2,
        tradesReturned: trades.length,
        truncated,
        refundNotice: syncRefundNotice ?? null,
        windowReason,
      };

      if (freshTrades.length === 0) {
        setSyncMessage(describeSyncResult({ ...outcome, fresh: 0 }));
        loadHistory();
        return;
      }

      if (skippedUnidentified > 0) {
        // Rare, and worth saying out loud rather than silently dropping someone's fills.
        console.warn(
          `[broker-sync] skipped ${skippedUnidentified} trade(s) with no source id from ${label}.`,
        );
      }

      // One id scheme for both importers — see brokerTradeIds for the bug that two copies of it hid.
      const stamp = startedAt.getTime();
      const withIds: Trade[] = freshTrades.map(
        (t, i) => ({ ...t, id: manualSyncTradeId(account.id, stamp, i) }) as Trade,
      );
      // Awaited: the message below is a claim that these trades are in the journal, so it must
      // not be made until they are. A rejection here lands in the catch, where the sync is
      // reported as failed rather than celebrated.
      const pulled = `${freshTrades.length} trade${freshTrades.length === 1 ? '' : 's'}`;
      try {
        await onImportTrades(withIds);
      } catch (saveErr) {
        /*
         * The pull worked and the sync has already been spent — the journal is what refused. That
         * is a different failure from "your broker said no", and saying so is the difference
         * between a trader who reloads and one who concludes the product does not work. It is
         * still reported, but as a named error rather than the anonymous unhandled rejection this
         * used to become.
         */
        reportErrorSilently(saveErr, 'promise', 'broker-sync-save');
        setError(
          `We pulled ${pulled} from ${label}, but your journal could not save them. `
          + describeJournalWriteError(saveErr),
        );
        setErrorDetail(null);
        return;
      }
      setSyncMessage(describeSyncResult({ ...outcome, fresh: freshTrades.length }));
      loadHistory();
    } catch (err) {
      // A failed sync usually still costs one. The server now says how many are left even when it
      // fails — and says so after refunding, when the failure was an outage rather than a rejected
      // call — so the meter tracks reality instead of freezing at whatever it read on page load.
      if (err instanceof BrokerApiError && typeof err.syncsRemaining === 'number') {
        const perDay = err.syncsPerDay ?? limits.syncsPerDay;
        const bonus = err.syncCredits ?? usage.syncCredits ?? 0;
        noteUsage({
          syncsUsed: Math.max(0, perDay - (err.syncsRemaining - bonus)),
          syncsRemaining: err.syncsRemaining,
          syncCredits: bonus,
        });
      }
      showError(err, 'Sync failed', 'broker-sync');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleDisconnect = async (account: BrokerAccountSummary) => {
    setError(null);
    setErrorDetail(null);
    setSyncMessage(null);
    try {
      await disconnectBroker(account.authorizationId);
      const next = await refreshStatus();

      // Deletion is queued on SnapTrade's side, not immediate, so the connection can still come
      // back in the status read a moment later. Saying so beats a Disconnect that visibly does
      // nothing and invites a second press.
      const stillListed = next?.accounts.some((a) => a.authorizationId === account.authorizationId);
      setSyncMessage(
        stillListed
          ? `Disconnecting ${account.name ?? account.institutionName} — this can take a moment to clear.`
          : `Disconnected ${account.name ?? account.institutionName}.`,
      );
    } catch (err) {
      showError(err, 'Could not disconnect', 'broker-disconnect');
    }
  };

  const accountsForInstitution = (entry: BrokerRegistryEntry) =>
    (status?.accounts ?? []).filter((a) => matchesBrokerEntry(a.institutionName, entry));

  return (
    <PageFrame
      sidebarDestination
      eyebrow="Connect a broker"
      title="Import trades from your broker"
      icon={Link2}
      onBack={onBack}
      /*
       * One sentence. This was two paragraphs — what SnapTrade is, where the credentials go, that
       * you can disconnect, that you can log by hand, that re-syncing is safe — before the first
       * account, and one of its claims ("never pulls from your broker on its own") stopped being
       * true the day Diamond's morning import shipped. The detail lives in each account's "How
       * the connection works" disclosure below, where somebody who wants it can open it.
       */
      subtitle="Link a broker and your fills import with one tap. Read-only — your login never touches Trend Chasers, and you can disconnect any time."
    >
      {/* The plan's allowance in one line, from the plan rather than a count of what's on screen:
          someone who has downgraded still sees the connections they made, and the honest number is
          what their plan allows now — otherwise a refused Connect looks like a bug. */}
      {limits.brokers > 0 && (
        <p className="text-sm text-text-secondary rounded-xl border border-border/60 bg-bg-tertiary/40 px-4 py-2.5">
          <span className="font-semibold text-text-primary">{TIER_PLANS[tier].name}</span>
          {' · '}
          {brokersLabel(limits).toLowerCase()}
          {' · '}
          {syncsLabel(limits).toLowerCase()}
          {(usage.syncsRemaining < limits.syncsPerDay || (usage.syncCredits ?? 0) > 0) && (
            <>
              {' — '}
              <span className="text-text-primary font-medium">{usage.syncsRemaining} left today</span>
              {(usage.syncCredits ?? 0) > 0 && <> (incl. {usage.syncCredits} bonus)</>}
            </>
          )}
        </p>
      )}

      {/*
        * Offered before they press anything.
        *
        * A free account can connect nothing, so the old path was: press Connect, wait, read a
        * 402 telling you to go and buy something. The offer belongs in front of that, at the
        * moment they are already looking at the button.
        */}
      {canConnect && limits.brokers === 0 && (
        <div className="panel-card p-5">
          <p className="text-sm font-medium text-text-primary mb-1">
            Broker sync isn&apos;t on your plan yet
          </p>
          {/* The free week is only promised to somebody who can actually have one. The server's
              "you have already had a trial" rule fires for the first time now that the Creem
              webhook records one, and this card gated on the FEATURE being locked, not on
              eligibility — so an ex-triallist was offered a free week and then sent to a pricing
              page that does not offer it. */}
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Connect your brokerage and your fills import themselves, matched into round trips with
            fees worked out.{' '}
            {trialAvailable
              ? `Try it free for ${TRIAL_DAYS} days and see your own calendar fill in.`
              : 'It is on every paid plan.'}
          </p>
          <StartTrialButton
            viaPricing
            className="max-w-sm"
            fallback={
              <button
                type="button"
                onClick={goToPricing}
                className="btn-primary w-full max-w-sm py-2.5 text-sm font-semibold"
              >
                See the plans
              </button>
            }
          />
        </div>
      )}

      {!firebaseEnabled ? (
        <div className="panel-card p-6 text-sm text-text-secondary">
          Broker connect requires cloud sync to be configured for this deployment. Ask the site owner to
          set up Firebase.
        </div>
      ) : !canConnect ? (
        <div className="panel-card p-6 text-sm text-text-secondary">
          Sign in to connect a broker — your connection is tied securely to your account.
        </div>
      ) : available === false ? (
        <div className="panel-card p-6 text-sm text-text-secondary">
          Broker connect isn&apos;t set up on this deployment yet. The site owner needs to add
          SnapTrade API keys (SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY).
        </div>
      ) : null}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
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
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent flex items-start gap-2">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p>{syncMessage}</p>
            {/* Amber, not the success green: these are things the import could not do, and a
                trader who never notices them is a trader whose totals silently disagree with
                their broker. */}
            {syncNotes.length > 0 && (
              <ul className="mt-2 space-y-1.5 border-t border-accent/20 pt-2">
                {syncNotes.map((note) => (
                  <li key={note} className="text-xs text-amber-200/90 leading-relaxed">
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {history && history.length > 0 && <SyncHistory events={history} describe={describeEvent} />}

      {/* Twenty brokers down one 768px column was five screens of scrolling to find yours. A grid
          puts every one of them within a glance on a desktop. */}
      <div className="grid gap-2 md:gap-3 items-start md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {brokerCopy.map((broker) => {
          const accounts = accountsForInstitution(broker.entry);
          const isConnected = accounts.length > 0;

          return (
            <article key={broker.key} className="panel-card p-5">
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
          className="self-start inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors focus-ring rounded px-1"
        >
          {statusLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {/* While the live answer is on its way the list above is last visit's; say so. */}
          {statusLoading ? 'Checking your connections…' : 'Refresh connections'}
        </button>
      )}
    </PageFrame>
  );
}
