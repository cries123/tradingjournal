import { useEffect, useState } from 'react';
import { Eye, Link2, PenLine } from 'lucide-react';
import { adminReadUserJournal } from '../../services/adminUserManagement';
import { AdminImpersonateButton } from './AdminImpersonateButton';
import type { UserJournalSnapshot } from '../../../server/adminUserJournal';

/**
 * Their journal, as they see it, without becoming them — and the button that does become them.
 *
 * The panel itself is every read and no write: nothing on it can change their account. It is the
 * answer to the question that brings somebody here — "they say syncing is broken, what does their
 * account actually look like" — so it leads with the split that settles it: how many trades came
 * from a broker against how many were typed, per journal, and what was most recently written.
 *
 * Sign in as them sits beside it rather than replacing it, because the two are not the same tool.
 * This one is free to use and cannot go wrong; that one replaces the session, writes into a
 * customer’s account under their own name, and is worth reaching for only when looking is not
 * enough. The ordering on screen says which to try first.
 */

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString()}`;

export function AdminViewJournalSection({ uid, label }: { uid: string; label: string }) {
  const [loaded, setLoaded] = useState<{
    uid: string;
    snapshot: UserJournalSnapshot | null;
    error: string | null;
  } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    adminReadUserJournal(uid)
      .then((snapshot) => {
        if (!cancelled) setLoaded({ uid, snapshot, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoaded({
          uid,
          snapshot: null,
          error: err instanceof Error ? err.message : 'Could not load their journal.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [uid, open]);

  const current = loaded?.uid === uid ? loaded : null;
  const snap = current?.snapshot ?? null;
  const busy = open && !current;

  return (
    <section className="border-t border-border/50 pt-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
          <Eye size={13} />
          Their journal (read-only)
        </h3>
        <div className="flex items-center gap-2">
        <AdminImpersonateButton uid={uid} label={label} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-accent hover:underline focus-ring rounded px-2 py-1"
        >
          {open ? 'Hide' : 'View what they see'}
        </button>
        </div>
      </div>

      {open && (
        <div className="mt-3">
          {busy && <p className="text-xs text-text-secondary">Loading…</p>}
          {current?.error && <p className="text-xs text-red-400">{current.error}</p>}

          {snap && (
            <>
              <p className="text-xs text-text-secondary">
                {snap.totalTrades.toLocaleString()} trades across{' '}
                {snap.journals.length} {snap.journals.length === 1 ? 'journal' : 'journals'}.
              </p>

              <ul className="space-y-1.5 mt-3">
                {snap.journals.map((j) => (
                  <li key={j.accountId} className="rounded-lg border border-border/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium">
                        {j.name ?? (
                          /* No name means the journal was removed and its trades were left
                             behind — invisible to them, and the reason a count can look wrong. */
                          <span className="text-amber-300/90">
                            Deleted journal ({j.accountId})
                          </span>
                        )}
                        {j.accountId === snap.activeAccountId && (
                          <span className="ml-2 text-[10px] uppercase text-emerald-400">Active</span>
                        )}
                      </span>
                      <span
                        className={`text-xs tabular-nums ${
                          j.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {money(j.netPnl)}
                      </span>
                    </div>

                    <p className="text-[11px] text-text-secondary mt-1 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Link2 size={10} />
                        {j.fromBroker.toLocaleString()} imported
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <PenLine size={10} />
                        {j.handEntered.toLocaleString()} typed
                      </span>
                    </p>
                  </li>
                ))}
              </ul>

              {snap.rules && (
                <p className="text-[11px] text-text-secondary mt-3">
                  Rules: {JSON.stringify(snap.rules)}
                </p>
              )}

              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mt-4">
                Last written
              </h4>
              {/* Ordered by when each row was last saved, not by trade date — a sync imports
                  history, so the newest thing in the account is often an old trade. */}
              <ul className="space-y-1 mt-2 max-h-56 overflow-y-auto pr-1">
                {snap.recent.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 text-[11px] border-b border-border/30 pb-1"
                  >
                    <span className="min-w-0 truncate">
                      {t.date} · {t.symbol}
                      {!t.fromBroker && <span className="text-amber-300/90 ml-1">typed</span>}
                    </span>
                    <span className="text-text-secondary shrink-0">{formatWhen(t.savedAt)}</span>
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
