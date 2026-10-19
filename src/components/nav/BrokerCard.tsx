import { useMemo, useState } from 'react';
import { ChevronRight, Landmark, Link2 } from 'lucide-react';
import type { Trade } from '../../types';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { lastBrokerSync, readCachedBrokerStatus, readLastBrokerSync } from '../../services/brokerStatusCache';
import { brokerCardState } from '../../utils/brokerCard';
import { brokerLogoSrc } from '../../utils/brokerLogos';
import { relativeTime } from '../../utils/relativeTime';

interface BrokerCardProps {
  /** A trade in the journal came from a broker — the fallback when this browser never saw the account list. */
  hasBrokerTrades: boolean;
  /** Every trade, for the newest import's save time. */
  trades?: readonly Trade[];
  /** Opens the broker screen. Syncing is done there, by hand; this card never contacts the broker. */
  onConnectBroker: () => void;
  /** The sidebar's card, or More's grouped rows. */
  variant?: 'sidebar' | 'more';
}

/** The institution's logo on a white square, the way the broker grid shows it; a bank icon without one. */
function LogoSquare({ institution, size }: { institution: string | null; size: number }) {
  const src = brokerLogoSrc(institution);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-white p-1"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <Landmark size={size * 0.55} className="text-slate-500" />}
    </span>
  );
}

/**
 * The broker, and the one thing you come back to it for: Sync.
 *
 * It replaced a "Connect broker" nav row that read the same before connecting and for ever after,
 * so the most-used action in the app — pulling in today's fills — was two clicks from everywhere.
 * Sync opens the broker screen rather than syncing from here: a sync has to dedupe against every
 * journal and report what it did, and that screen is where both already happen.
 *
 * Everything shown is read, never fetched: the account names from the last answer this browser saw,
 * "Synced" from the later of this browser's last sync and the newest imported trade, and the
 * allowance from the entitlement the server enforces.
 */
export function BrokerCard({ hasBrokerTrades, trades = [], onConnectBroker, variant = 'sidebar' }: BrokerCardProps) {
  const { user } = useAuth();
  const { limits, usage, loaded } = useEntitlement();
  const uid = user?.uid ?? null;
  const cached = useMemo(() => (uid ? readCachedBrokerStatus(uid) : null), [uid]);
  const recorded = useMemo(() => (uid ? readLastBrokerSync(uid) : null), [uid]);
  const syncedAt = useMemo(() => lastBrokerSync(recorded, trades), [recorded, trades]);
  const [now] = useState(() => Date.now());
  const state = brokerCardState({
    institutions: cached?.accounts.map((a) => a.institutionName) ?? [],
    hasBrokerTrades,
    syncsPerDay: limits.syncsPerDay,
    syncsUsed: loaded ? usage.syncsUsed : null,
    syncedAt,
  });
  const synced = state.syncedAt != null ? `Synced ${relativeTime(new Date(state.syncedAt).toISOString(), now)}` : null;

  const sync = (
    <button
      type="button"
      onClick={onConnectBroker}
      className={`shrink-0 rounded-full bg-accent font-bold text-bg-primary hover:opacity-90 transition-opacity focus-ring ${
        variant === 'more' ? 'h-[34px] px-3.5 text-[13px]' : 'px-3 py-1 text-xs'
      }`}
    >
      Sync
    </button>
  );

  if (variant === 'more') {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-bg-card">
        {state.connected && (
          <div className="flex min-h-[56px] items-center gap-3 px-3.5 py-2">
            <LogoSquare institution={state.institution} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{state.name}</p>
              <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${state.spent ? 'text-loss-bright' : 'text-text-secondary'}`}>
                {synced && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" aria-hidden />}
                <span className="truncate">
                  {[synced, state.left != null ? `${state.left} of ${state.perDay} syncs left` : null].filter(Boolean).join(' · ')}
                </span>
              </p>
            </div>
            {sync}
          </div>
        )}
        <button
          type="button"
          onClick={onConnectBroker}
          className={`flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-left text-[15px] hover:bg-white/[0.03] focus-ring ${
            state.connected ? 'border-t border-white/[0.07]' : ''
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#1c1c1c] text-text-secondary" aria-hidden>
            <Link2 size={18} />
          </span>
          <span className="flex-1">{state.connected ? 'Connect another broker' : 'Connect a broker'}</span>
          <ChevronRight size={16} className="text-text-secondary/60" aria-hidden />
        </button>
      </div>
    );
  }

  if (!state.connected) {
    return (
      <button
        type="button"
        onClick={onConnectBroker}
        className="mx-0.5 flex w-[calc(100%-4px)] items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-[13px] text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors focus-ring"
      >
        <Link2 size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="flex-1">
          <span className="block font-medium text-text-primary">Connect a broker</span>
          <span className="block text-[11px]">Import your fills instead of typing them</span>
        </span>
      </button>
    );
  }

  return (
    <div className="mx-0.5 rounded-xl border border-border px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <LogoSquare institution={state.institution} size={26} />
        <div className="min-w-0">
          <p className="truncate text-[13px]" title={state.name}>{state.name}</p>
          {synced && (
            <p className="mt-px flex items-center gap-[5px] text-[11px] text-text-secondary">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              {synced}
            </p>
          )}
        </div>
      </div>
      <div className="mt-[9px] flex items-center justify-between gap-2 text-[11.5px]">
        <span className={`tabular-nums ${state.spent ? 'text-loss-bright' : 'text-text-secondary'}`}>
          {state.left != null ? `${state.left} of ${state.perDay} left` : ''}
        </span>
        {sync}
      </div>
    </div>
  );
}
