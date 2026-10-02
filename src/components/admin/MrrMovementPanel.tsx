import { TrendingDown, TrendingUp } from 'lucide-react';
import type { MonthMovement } from '../../utils/adminRisk';

interface MrrMovementPanelProps {
  rows: MonthMovement[];
}

/** Newest first, and only as far back as a direction is worth reading. */
const MAX_MONTHS = 6;

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

/**
 * Where the revenue went, rather than what it totalled.
 *
 * The table above this one already shows collected per month, and a total says nothing about
 * direction: two flat months can be a stable business or half the customers leaving while half as
 * many arrive. Those are not the same month and the costs screen could not tell them apart.
 *
 * "Stopped paying" rather than "churned", deliberately. Nothing records the moment somebody leaves —
 * a cancelled subscription simply stops producing charges — so the measurable version is a month of
 * silence from an account that paid the month before. It lags by a month, and it will count anyone
 * whose renewal date straddles a month boundary. Naming it for what it measures is cheaper than a
 * footnote nobody reads.
 */
export function MrrMovementPanel({ rows }: MrrMovementPanelProps) {
  if (rows.length === 0) return null;

  const recent = [...rows].reverse().slice(0, MAX_MONTHS);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">Which way it is going</h3>
      <p className="text-xs text-text-secondary mb-3">
        First payments against accounts that stopped paying, from the charge ledger. Counted from
        charges rather than from plans, because once somebody cancels nothing is left on their record
        saying they used to pay — a closed month cannot be rebuilt from the current state.
      </p>

      <div className="panel-card rounded-xl divide-y divide-border/30">
        {recent.map((m) => (
          <div key={m.month} className="flex items-center gap-3 px-4 py-2.5 text-xs">
            <span className="w-16 shrink-0 font-medium">{monthLabel(m.month)}</span>

            <span className="flex-1 tabular-nums text-text-secondary">
              <span className="text-emerald-400">+{m.newCustomers}</span> new
              {m.churned > 0 && (
                <>
                  {' · '}
                  <span className="text-red-400">−{m.churned}</span> stopped
                </>
              )}
            </span>

            {/*
              The net is the point of the row, so it carries the arrow. A zero gets neither colour
              nor an icon: flat is not good news and not bad news, and painting it either way is the
              thing a direction panel exists to stop.
            */}
            <span
              className={`flex w-16 shrink-0 items-center justify-end gap-1 font-semibold tabular-nums ${
                m.net > 0 ? 'text-emerald-400' : m.net < 0 ? 'text-red-400' : 'text-text-secondary'
              }`}
            >
              {m.net > 0 && <TrendingUp size={12} aria-hidden />}
              {m.net < 0 && <TrendingDown size={12} aria-hidden />}
              {m.net > 0 ? `+${m.net}` : m.net}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
