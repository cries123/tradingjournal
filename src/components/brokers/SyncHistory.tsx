import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import type { JournalEvent } from '../../utils/journalEvents';

/**
 * The trader's own recent syncs, manual and automatic, under the connect screen.
 *
 * This history has been written for every manual sync for a year and was readable only from the
 * admin panel. A Diamond trader whose morning import had been finding nothing for a week had no way
 * to see that, and wrote in. The rows are the same ones support reads, in the same words.
 */
export function SyncHistory({ events, describe }: { events: JournalEvent[]; describe: (e: JournalEvent) => string }) {
  // Read once on open: relative ages do not need to tick, and the clock is not read during render.
  const [now] = useState(() => Date.now());

  return (
    <details className="panel-card group">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium focus-ring rounded-xl">
        <span className="flex items-center gap-2">
          <History size={15} className="text-accent" aria-hidden />
          Recent syncs
          <span className="text-text-secondary font-normal">· {events.length}</span>
        </span>
        <ChevronDown size={15} className="shrink-0 text-text-secondary transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="border-t border-border/40 divide-y divide-border/30">
        {events.map((event, i) => (
          <li key={`${event.at}-${i}`} className="px-4 py-2.5 text-xs leading-relaxed">
            <span className="text-text-secondary tabular-nums">{relative(event.at, now)}</span>
            <span className="text-text-secondary"> · </span>
            <span className={event.sync?.automatic ? 'text-text-secondary' : 'text-text-primary'}>{describe(event)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** "2h ago", "3d ago", else the date. */
function relative(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
