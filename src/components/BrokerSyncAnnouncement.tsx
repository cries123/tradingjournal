import { useState } from 'react';
import { Link2, ShieldCheck, X } from 'lucide-react';

const STORAGE_KEY = 'trend-chasers-broker-sync-announcement-dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface BrokerSyncAnnouncementProps {
  onConnectBroker: () => void;
}

/** One-time in-app callout letting existing users know broker sync launched. Dismissible and
 *  remembered per-browser (localStorage) so it doesn't linger once acknowledged. */
export function BrokerSyncAnnouncement({ onConnectBroker }: BrokerSyncAnnouncementProps) {
  const [dismissed, setDismissed] = useState(isDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Best effort — worst case the banner reappears next visit.
    }
  };

  return (
    <div className="relative flex flex-wrap items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 pl-4 pr-9 py-3.5 shrink-0">
      <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0 text-accent">
        <Link2 size={16} />
      </div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-text-primary">Import your trades from 20 brokers</p>
        <p className="text-xs text-text-secondary leading-relaxed mt-0.5 max-w-2xl hidden sm:block">
          Connect your broker — Schwab, Fidelity, Robinhood, Interactive Brokers, Webull, and 15 more
          — and pull your round-trip trades in with one tap, whenever you want them. It&apos;s
          read-only and it only runs when you press Sync — Trend Chasers can&apos;t see your balance
          or place trades on your behalf, and you can disconnect anytime.
        </p>
        {/* Phones get the short version. The full pitch is one tap away on the connect screen,
            and it isn't worth half a phone screen sitting above the user's own P&L. */}
        <p className="text-xs text-text-secondary leading-relaxed mt-0.5 sm:hidden">
          Read-only import from 20 brokers, whenever you press Sync. Disconnect anytime.
        </p>
        <button
          type="button"
          onClick={onConnectBroker}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors focus-ring rounded"
        >
          <ShieldCheck size={13} />
          Connect a broker →
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
      >
        <X size={14} />
      </button>
    </div>
  );
}
