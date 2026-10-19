import { useEffect, useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { fetchUserEmails, type EmailLogEntry } from '../../services/adminOps';
import { relativeTime } from '../../utils/relativeTime';

/**
 * What this person has been sent.
 *
 * Loaded on demand, like the sync history above it: a query per card open to answer a question
 * nobody asked is a slow panel for everybody. Once open, the rows are the mailer's own log, so a
 * send that the provider refused shows as exactly that.
 */
export function AdminUserEmailLogSection({ email, now }: { email: string; now: number }) {
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; rows: EmailLogEntry[] | null; error: string | null } | null>(null);
  const key = `${email}:${reload}`;

  useEffect(() => {
    if (!open || !email) return;
    let cancelled = false;
    fetchUserEmails(email)
      .then((rows) => {
        if (!cancelled) setLoaded({ key, rows, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ key, rows: null, error: err instanceof Error ? err.message : 'Could not load their emails.' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, email, key]);

  const current = loaded?.key === key ? loaded : null;
  const busy = open && !current;

  return (
    <section className="border-t border-border/50 pt-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
          <Mail size={13} />
          Emails sent to them
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
            disabled={!email}
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-accent hover:underline focus-ring rounded px-2 py-1 disabled:opacity-50"
          >
            {open ? 'Hide' : 'Load emails'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3">
          {busy && <p className="text-xs text-text-secondary">Loading…</p>}
          {current?.error && <p className="text-xs text-red-400">{current.error}</p>}
          {current?.rows && current.rows.length === 0 && (
            <p className="text-xs text-text-secondary leading-relaxed">
              Nothing sent to this address since the log started. Older sends are only in the mail provider's dashboard.
            </p>
          )}
          {current?.rows && current.rows.length > 0 && (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {current.rows.map((row) => (
                <li key={row.id ?? `${row.at}-${row.subject}`} className="rounded-lg border border-border/50 px-3 py-2">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-text-secondary">
                    <span className="tabular-nums">{relativeTime(row.at, now)}</span>
                    {row.tag && <span className="rounded bg-bg-primary/60 px-1 font-mono text-[10px]">{row.tag}</span>}
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.sent ? 'bg-accent/15 text-accent' : 'bg-red-500/15 text-red-400'}`}>
                      {row.sent ? 'Sent' : `Not sent · ${row.reason ?? 'unknown'}`}
                    </span>
                  </p>
                  <p className="text-xs mt-0.5">{row.subject}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
