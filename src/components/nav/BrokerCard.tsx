import { useMemo } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { readCachedBrokerStatus } from '../../services/brokerStatusCache';
import { brokerCardState } from '../../utils/brokerCard';

interface BrokerCardProps {
  /** Any trade came from a broker — the fallback when this browser has never seen the account list. */
  hasBrokerTrades: boolean;
  /** Opens the broker screen. Syncing is done there, by hand; this card never contacts the broker. */
  onConnectBroker: () => void;
  size?: 'compact' | 'comfortable';
}

/**
 * The broker, and the one thing you come back to it for: Sync.
 *
 * It replaces a "Connect broker" nav row that read the same before connecting and for ever after,
 * so the most-used action in the app — pulling in today's fills — was two clicks from everywhere.
 * The button opens the broker screen rather than syncing from here: a sync has to dedupe against
 * every journal and report what it did, and that screen is where both already happen.
 *
 * What it shows is read, never fetched: the account names come from the last answer this browser
 * saw (services/brokerStatusCache), and the allowance from the entitlement the server enforces. No
 * "synced 2 h ago": the app does not know when the last sync ran on another device or the morning
 * import, and a time it guessed would be the one figure here that was wrong.
 */
export function BrokerCard({ hasBrokerTrades, onConnectBroker, size = 'compact' }: BrokerCardProps) {
  const { user } = useAuth();
  const { limits, usage, loaded } = useEntitlement();
  const uid = user?.uid ?? null;
  const cached = useMemo(() => (uid ? readCachedBrokerStatus(uid) : null), [uid]);
  const state = brokerCardState({
    institutions: cached?.accounts.map((a) => a.institutionName) ?? [],
    hasBrokerTrades,
    syncsPerDay: limits.syncsPerDay,
    syncsUsed: loaded ? usage.syncsUsed : null,
  });
  const big = size === 'comfortable';

  if (!state.connected) {
    return (
      <button
        type="button"
        onClick={onConnectBroker}
        className={`w-full flex items-center gap-2.5 rounded-xl border border-dashed border-border text-left text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors focus-ring ${
          big ? 'px-4 py-3.5 text-sm' : 'px-3 py-2.5 text-[13px]'
        }`}
      >
        <Link2 size={big ? 18 : 15} className="shrink-0 text-accent" aria-hidden />
        <span className="flex-1">
          <span className="block font-medium text-text-primary">Connect a broker</span>
          <span className="block text-[11px] text-text-secondary">Import your fills instead of typing them</span>
        </span>
      </button>
    );
  }

  const sync = (
    <button
      type="button"
      onClick={onConnectBroker}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full bg-accent font-semibold text-bg-primary hover:opacity-90 transition-opacity focus-ring ${
        big ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <RefreshCw size={big ? 14 : 12} aria-hidden />
      Sync
    </button>
  );
  const allowance = state.allowance && (
    <p className={`tabular-nums ${big ? 'text-xs' : 'text-[11px]'} ${state.allowanceSpent ? 'text-loss-bright' : 'text-text-secondary'}`}>
      {state.allowance}
    </p>
  );
  const icon = (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent ${big ? 'h-9 w-9' : 'h-7 w-7'}`}
      aria-hidden
    >
      <Link2 size={big ? 17 : 14} />
    </span>
  );

  // In a 200px sidebar the name, the allowance and the button do not fit on one line, and a
  // truncated "Your brok…" is a broker you cannot read. Two lines there; one on a phone, which has
  // the width.
  return big ? (
    <div className="rounded-xl border border-border bg-bg-tertiary/30 p-4 flex items-center gap-3 min-w-0">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{state.name}</p>
        {allowance}
      </div>
      {sync}
    </div>
  ) : (
    <div className="rounded-xl border border-border bg-bg-tertiary/30 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <p className="truncate text-[13px] font-medium text-text-primary" title={state.name}>{state.name}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        {allowance ?? <span />}
        {sync}
      </div>
    </div>
  );
}
