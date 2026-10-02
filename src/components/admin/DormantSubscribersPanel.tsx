import { MoonStar } from 'lucide-react';
import { AdminUserRef } from './AdminUserRef';
import { TIER_PLANS } from '../../config/tiers';
import { DORMANT_DAYS, type DormantRow } from '../../utils/adminRisk';

interface DormantSubscribersPanelProps {
  rows: DormantRow[];
  onOpenUser: (uid: string) => void;
  canOpenUser: (uid: string) => boolean;
}

/** How many to show before it stops being a list to work through. */
const MAX_ROWS = 8;

/**
 * Paying, and not using it.
 *
 * The only list in the panel that lets the owner act BEFORE the decision rather than after it.
 * Somebody who has not logged a trade in three weeks has already stopped getting value out of this;
 * the cancellation is the paperwork catching up, and by the time it lands there is nothing to say.
 *
 * Capped, because the point is a handful of emails rather than a report. The silence is what sorts
 * it, with "never logged a trade" at the top: a subscriber who has never once used the thing they
 * are paying for is the clearest case there is.
 */
export function DormantSubscribersPanel({
  rows,
  onOpenUser,
  canOpenUser,
}: DormantSubscribersPanelProps) {
  if (rows.length === 0) {
    return (
      <div className="panel-card rounded-xl p-5 text-sm text-text-secondary">
        <span className="font-medium text-text-primary">Everybody paying is trading.</span> No
        subscriber has been quiet for {DORMANT_DAYS} days.
      </div>
    );
  }

  const shown = rows.slice(0, MAX_ROWS);
  const atStake = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="panel-card rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/40 px-4 py-3 md:px-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MoonStar size={15} className="text-text-secondary" aria-hidden />
          Paying, not trading
        </p>
        <p className="text-xs text-text-secondary">
          {rows.length} · <span className="tabular-nums text-text-primary">${atStake}</span>/mo
        </p>
      </div>

      <ul className="divide-y divide-border/30">
        {shown.map((row) => (
          <li key={row.uid} className="flex items-center gap-3 px-4 py-2.5 text-xs md:px-5">
            <span className="min-w-0 flex-1 truncate">
              <AdminUserRef uid={row.uid} onOpen={onOpenUser} canOpen={canOpenUser}>
                {row.email}
                {row.username ? ` (@${row.username})` : ''}
              </AdminUserRef>
            </span>
            <span className="shrink-0 text-text-secondary">{TIER_PLANS[row.tier].name}</span>
            <span className="w-24 shrink-0 text-right tabular-nums text-text-secondary">
              {/* "Never" rather than a four-figure day count, which is what a null would render as
                  if it were treated as a number. */}
              {row.quietFor === null ? 'never traded' : `${row.quietFor}d quiet`}
            </span>
          </li>
        ))}
      </ul>

      {rows.length > shown.length && (
        <p className="border-t border-border/40 px-4 py-2.5 text-[11px] text-text-secondary md:px-5">
          {rows.length - shown.length} more, longest silence first.
        </p>
      )}
    </div>
  );
}
