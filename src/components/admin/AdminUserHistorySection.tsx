import { useEffect, useState } from 'react';
import { Bug, History, LifeBuoy } from 'lucide-react';
import { fetchAuditLogForUser, type AdminAuditEntry } from '../../services/adminAuditLog';
import type { BugReport } from '../../services/bugReports';
import type { SupportTicket } from '../../services/supportTickets';

interface AdminUserHistorySectionProps {
  uid: string;
  tickets: SupportTicket[];
  reports: BugReport[];
  /** The labels the audit tab already uses, so the two never describe one action two ways. */
  actionLabels: Record<AdminAuditEntry['action'], string>;
  /** Bumped by the modal after each of its own actions, so the trail refreshes without a reopen. */
  version: number;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Everything the panel knows about this one person, in one place: the tickets they opened, the
 * bugs they reported, and every admin action ever taken on the account. The context you want
 * before touching an account is usually "what happened last time", and it used to live across
 * three tabs.
 */
export function AdminUserHistorySection({ uid, tickets, reports, actionLabels, version }: AdminUserHistorySectionProps) {
  const [entries, setEntries] = useState<AdminAuditEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAuditLogForUser(uid).then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, version]);

  const nothing = tickets.length === 0 && reports.length === 0 && entries !== null && entries.length === 0;

  return (
    <div className="border-t border-border/50 pt-5 mt-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">History</p>

      {nothing && <p className="text-sm text-text-secondary">Nothing yet — no tickets, no bug reports, no admin actions.</p>}

      {tickets.length > 0 && (
        <ul className="space-y-1.5">
          {tickets.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-xs">
              <LifeBuoy size={13} className="mt-0.5 shrink-0 text-sky-400" aria-hidden />
              <span className="min-w-0">
                <span className="text-text-primary">{t.subject}</span>
                <span className="text-text-secondary"> · ticket · {t.status} · {when(t.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {reports.length > 0 && (
        <ul className="space-y-1.5">
          {reports.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-xs">
              <Bug size={13} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
              <span className="min-w-0">
                <span className="text-text-primary">{r.description.slice(0, 90)}{r.description.length > 90 ? '…' : ''}</span>
                <span className="text-text-secondary"> · bug report · {r.status} · {when(r.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {entries === null ? (
        <p className="text-xs text-text-secondary">Loading admin actions…</p>
      ) : entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              <History size={13} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden />
              <span className="min-w-0">
                <span className="text-text-primary">{actionLabels[e.action] ?? e.action}</span>
                {e.detail && <span className="text-text-secondary"> — {e.detail}</span>}
                <span className="text-text-secondary"> · {when(e.at)}{e.adminEmail ? ` · ${e.adminEmail}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
