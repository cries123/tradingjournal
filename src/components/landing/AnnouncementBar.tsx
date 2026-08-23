import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

const STORAGE_KEY = 'trend-chasers-broker-launch-bar-dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface AnnouncementBarProps {
  onGuide?: (slug: string) => void;
}

/** Slim top-of-page banner announcing broker sync's launch. Self-dismissing (localStorage) so
 *  returning visitors don't see it forever — the permanent explanation lives in the Broker Sync
 *  landing section and the /guides/broker-sync-now-live article this links to. */
export function AnnouncementBar({ onGuide }: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(isDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Best effort — worst case the bar reappears next visit.
    }
  };

  return (
    <div className="relative z-20 border-b border-emerald-500/30 bg-emerald-500/10">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-2.5 flex items-center gap-3 text-sm">
        <Sparkles size={16} className="shrink-0 text-emerald-400" />
        <p className="flex-1 min-w-0 leading-snug text-text-primary">
          <span className="font-semibold text-emerald-300">Now live —</span> connect Schwab or Robinhood
          and sync trades automatically. Read-only: Trend Chasers can&apos;t see your balance or place
          trades on your behalf.
          {onGuide && (
            <button
              type="button"
              onClick={() => onGuide('broker-sync-now-live')}
              className="ml-1.5 font-medium text-emerald-300 underline underline-offset-2 hover:text-emerald-200 whitespace-nowrap"
            >
              How it works →
            </button>
          )}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 p-1 rounded text-text-secondary hover:text-text-primary hover:bg-emerald-500/10 transition-colors focus-ring"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
