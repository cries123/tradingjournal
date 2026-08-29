import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import type { AutoBrokerSync } from '../hooks/useAutoBrokerSync';

interface BrokerSyncStatusProps {
  sync: AutoBrokerSync;
}

function relativeTime(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Tells the trader whether what they're looking at is current.
 *
 * Automatic syncing is only trustworthy if you can see it happened — without this the feature is
 * invisible, and a quiet day looks identical to a broken connection. Renders nothing until
 * there's something true to say, so users with no broker linked never see it.
 */
export function BrokerSyncStatus({ sync }: BrokerSyncStatusProps) {
  const { state, lastSyncedAt, imported, syncNow } = sync;

  if (state === 'idle' && lastSyncedAt === null) return null;

  if (state === 'syncing') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-text-secondary shrink-0">
        <RefreshCw size={11} className="animate-spin motion-reduce:animate-none" />
        Syncing your broker…
      </p>
    );
  }

  if (state === 'failed') {
    return (
      <button
        type="button"
        onClick={syncNow}
        className="flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 transition-colors focus-ring rounded shrink-0"
      >
        <AlertCircle size={11} />
        Couldn&apos;t reach your broker — retry
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={syncNow}
      title="Sync now"
      className="flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-accent transition-colors focus-ring rounded shrink-0"
    >
      {state === 'done' && imported > 0 ? (
        <>
          <Check size={11} className="text-profit-bright" />
          Synced {imported} new trade{imported === 1 ? '' : 's'}
        </>
      ) : (
        <>
          <RefreshCw size={11} />
          {lastSyncedAt ? `Synced ${relativeTime(lastSyncedAt)}` : 'Up to date'}
        </>
      )}
    </button>
  );
}
