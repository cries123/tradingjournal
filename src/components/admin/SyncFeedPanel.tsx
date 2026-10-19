import { RefreshCw } from 'lucide-react';
import type { SyncFeedRow } from '../../../server/syncFeed';
import { describeEvent, wasWasted, type JournalEvent } from '../../utils/journalEvents';
import { relativeTime } from '../../utils/relativeTime';
import { AdminUserRef } from './AdminUserRef';

/**
 * Every sync across every user, newest first.
 *
 * The per-user history answers "what happened to this person"; this answers "what happened this
 * morning". A sync that timed out and a connection returning nothing were both found by a
 * customer writing in — this is where they show up first now. Rows are worded by the same
 * describeEvent the user's own history uses, so what the admin reads is what the trader read.
 */

const DAY_MS = 86_400_000;

/** How many rows to draw. The feed holds more; past this the reader wants a filter, not a scroll. */
const ROWS_SHOWN = 80;

export function SyncFeedPanel({
  rows,
  now,
  labelFor,
  onOpenUser,
  canOpenUser,
}: {
  rows: SyncFeedRow[];
  now: number;
  /** The username or email behind a uid, from the loaded user list. */
  labelFor: (uid: string) => string;
  onOpenUser?: (uid: string) => void;
  canOpenUser?: (uid: string) => boolean;
}) {
  const recent = rows.filter((r) => now - Date.parse(r.at) <= DAY_MS);
  const imported = recent.reduce((sum, r) => sum + (r.sync.fresh ?? r.sync.tradesReturned ?? 0), 0);
  const asEvent = (row: SyncFeedRow): JournalEvent => ({ type: 'sync', at: row.at, sync: row.sync });
  const empty = recent.filter((r) => wasWasted(asEvent(r))).length;
  const unlanded = recent.filter((r) => r.sync.landed === false).length;

  return (
    <section className="panel-card rounded-xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <RefreshCw size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Syncs, everyone</h2>
      </div>
      <p className="text-xs text-text-secondary mb-3">
        Last 24 hours: {recent.length} sync{recent.length === 1 ? '' : 's'}, {imported} trade{imported === 1 ? '' : 's'} in
        {empty > 0 && <span className="text-amber-300">, {empty} with nothing to import</span>}
        {unlanded > 0 && <span className="text-red-400">, {unlanded} never reached a journal</span>}.
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-text-secondary">
          Nothing recorded yet. The feed starts from the release that added it.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
          {rows.slice(0, ROWS_SHOWN).map((row) => {
            const event = asEvent(row);
            const tone = row.sync.landed === false
              ? 'border-red-500/30 bg-red-500/[0.04]'
              : wasWasted(event)
                ? 'border-amber-500/25 bg-amber-500/[0.04]'
                : 'border-border/40';
            return (
              <li key={row.id ?? `${row.uid}-${row.at}`} className={`rounded-lg border px-3 py-2 ${tone}`}>
                <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-text-secondary">
                  <span className="tabular-nums">{relativeTime(row.at, now)}</span>
                  <AdminUserRef uid={row.uid} onOpen={onOpenUser} canOpen={canOpenUser} className="font-medium text-text-primary">
                    {labelFor(row.uid)}
                  </AdminUserRef>
                  {row.sync.automatic && <span className="rounded bg-bg-primary/60 px-1 text-[10px]">morning import</span>}
                </p>
                <p className="text-xs mt-0.5 leading-relaxed">{describeEvent(event)}</p>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > ROWS_SHOWN && (
        <p className="mt-2 text-[11px] text-text-secondary">Showing the newest {ROWS_SHOWN} of {rows.length}.</p>
      )}
    </section>
  );
}
