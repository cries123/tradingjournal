import { useEffect, useState } from 'react';
import { AlertTriangle, History, RefreshCw, Trash2 } from 'lucide-react';
import { adminDeleteJournalEvents, adminReadJournalEvents } from '../../services/adminUserManagement';
import { describeEvent, MAX_EVENT_DELETES, wasWasted, type JournalEvent } from '../../utils/journalEvents';

/**
 * What this account's syncs actually did.
 *
 * Built after a paying customer cancelled saying their syncs ran, spent the day's allowance and
 * imported nothing — and there was no way to check whether that was true. syncUsage counts how
 * many syncs were spent and nothing about what any of them returned, so the trade total was the
 * only evidence, and a trade total cannot tell an empty sync from one that worked.
 *
 * Loaded on demand rather than with the modal. Most of the time somebody is opening a user to
 * change a plan, and a Firestore query per open to answer a question nobody asked is a slow panel
 * for everybody — the admin overview was already rebuilt once for exactly that reason.
 */

function formatWhen(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

export function AdminJournalEventsSection({ uid }: { uid: string }) {
  /*
   * Stamped with the request it answers, so "loading" is derived rather than set.
   *
   * A setBusy(true) at the top of the effect is the pattern eslint rejects here
   * (react-hooks/set-state-in-effect), and it is also the one that leaves one user’s history on
   * screen while the next one loads — which on a support screen is worse than a spinner.
   */
  const [loaded, setLoaded] = useState<{
    key: string;
    events: JournalEvent[] | null;
    error: string | null;
  } | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  /*
   * Rows ticked for deletion, keyed to the load they were ticked on so a refresh or another user
   * never carries a stale selection into a delete.
   */
  const [picked, setPicked] = useState<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  /** Two steps: the first press arms it, the second deletes. Undo does not exist for this. */
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);

  const key = `${uid}:${reload}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    adminReadJournalEvents(uid)
      .then((rows) => {
        if (!cancelled) setLoaded({ key, events: rows, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoaded({
          key,
          events: null,
          error: err instanceof Error ? err.message : 'Could not load the journal history.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [uid, open, key]);

  const current = loaded?.key === key ? loaded : null;
  const events = current?.events ?? null;
  const error = current?.error ?? null;
  const busy = open && !current;

  const wasted = events?.filter(wasWasted).length ?? 0;
  const selected = picked.key === key ? picked.ids : new Set<string>();

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked({ key, ids: next });
    setArmed(false);
  };

  const deleteSelected = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setDeleting(true);
    setDeleteNote(null);
    try {
      const { message } = await adminDeleteJournalEvents(uid, [...selected]);
      setDeleteNote(message);
      setReload((n) => n + 1);
    } catch (err) {
      setDeleteNote(err instanceof Error ? err.message : 'Could not delete those rows.');
    } finally {
      setDeleting(false);
      setArmed(false);
    }
  };

  return (
    <section className="border-t border-border/50 pt-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
          <History size={13} />
          Sync &amp; clear history
        </h3>

        <div className="flex items-center gap-2">
          {open && (
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-accent transition-colors focus-ring rounded px-2 py-1 disabled:opacity-50"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-accent hover:underline focus-ring rounded px-2 py-1"
          >
            {open ? 'Hide' : 'Load history'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3">
          {busy && <p className="text-xs text-text-secondary">Loading…</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {!busy && !error && events?.length === 0 && (
            <p className="text-xs text-text-secondary leading-relaxed">
              Nothing recorded yet. History starts from the release that added it, so an account
              that has not synced since then will look empty here even if it synced before.
            </p>
          )}

          {!busy && events && events.length > 0 && (
            <>
              {/*
                Deleting rows rewrites the history the trader reads on their own connect screen,
                which is the point: a sync that timed out still says "8,790 trades out" there.
              */}
              <div className="mb-2 flex flex-wrap items-center gap-2 min-h-[28px]">
                {selected.size > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void deleteSelected()}
                      disabled={deleting || selected.size > MAX_EVENT_DELETES}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors focus-ring disabled:opacity-50 ${
                        armed
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'border border-red-500/40 text-red-300 hover:bg-red-500/10'
                      }`}
                    >
                      <Trash2 size={11} />
                      {deleting
                        ? 'Deleting…'
                        : armed
                          ? `Confirm: delete ${selected.size} from their history`
                          : `Delete ${selected.size} selected`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked({ key, ids: new Set() });
                        setArmed(false);
                      }}
                      className="text-[11px] text-text-secondary hover:text-text-primary focus-ring rounded px-2 py-1"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <p className="text-[11px] text-text-secondary">
                    Tick rows to remove them. They disappear from the trader&apos;s own sync history too.
                  </p>
                )}
                {deleteNote && <p className="text-[11px] text-text-secondary">{deleteNote}</p>}
              </div>

              {wasted > 0 && (
                /* Counted at the top because it is the shape of the complaint, and scrolling a
                   long list to spot the pattern is how it gets missed. */
                <p className="text-xs text-amber-300/90 mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="shrink-0" />
                  {wasted} of the last {events.length} syncs returned no trades.
                </p>
              )}

              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {events.map((event, i) => (
                  <li
                    key={event.id ?? `${event.at}-${i}`}
                    className={`rounded-lg border px-3 py-2 ${
                      wasWasted(event)
                        ? 'border-amber-500/25 bg-amber-500/[0.04]'
                        : event.type === 'clear'
                          ? 'border-red-500/25 bg-red-500/[0.04]'
                          : 'border-border/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {event.id && (
                        <input
                          type="checkbox"
                          checked={selected.has(event.id)}
                          onChange={() => toggle(event.id!)}
                          aria-label={`Select the ${formatWhen(event.at)} row for deletion`}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-red-500 cursor-pointer"
                        />
                      )}
                      {event.type === 'clear' && (
                        <Trash2 size={12} className="mt-0.5 shrink-0 text-red-400" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] text-text-secondary">{formatWhen(event.at)}</p>
                        <p className="text-xs mt-0.5 leading-relaxed">{describeEvent(event)}</p>
                        {/* An automatic run spends no sync, so it carries no count. */}
                        {event.sync?.syncsRemaining != null && (
                          <p className="text-[10px] text-text-secondary mt-1">
                            {event.sync.syncsRemaining} syncs left after this one
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
