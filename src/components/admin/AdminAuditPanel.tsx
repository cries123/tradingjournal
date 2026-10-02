import { ScrollText } from 'lucide-react';
import { AUDIT_ACTION_LABELS, type AdminAuditEntry } from '../../services/adminAuditLog';

interface AdminAuditPanelProps {
  entries: AdminAuditEntry[];
}

/** Enough to answer "what did I just do", not enough to be a report. */
const MAX_ROWS = 12;

function when(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The admin actions that have been taken, newest first.
 *
 * Every one of these was already being written and already being loaded — `fetchRecentAuditLog`
 * runs in the panel's first wave and lands in state — and then nothing rendered it. The per-user
 * history inside the modal was the only way to see any of it, which answers "what happened to this
 * person" and never "what did I change on Tuesday".
 *
 * Worth having in front of you for the obvious reason: the actions it records are granting plans,
 * refunding, suspending and signing in as somebody. If the account is ever shared, or ever taken,
 * this is the only page that would show it.
 */
export function AdminAuditPanel({ entries }: AdminAuditPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="panel-card rounded-xl p-5 text-sm text-text-secondary">
        No admin actions recorded yet.
      </div>
    );
  }

  const shown = entries.slice(0, MAX_ROWS);

  return (
    <div className="panel-card rounded-xl overflow-hidden">
      <p className="flex items-center gap-2 border-b border-border/40 px-4 py-3 text-sm font-semibold md:px-5">
        <ScrollText size={15} className="text-text-secondary" aria-hidden />
        Recent admin actions
      </p>

      <ul className="divide-y divide-border/30">
        {shown.map((entry) => (
          <li key={entry.id} className="px-4 py-2.5 text-xs md:px-5">
            {/*
              A space, not a dash. Every label is written to be finished by its target — 'Granted a
              plan to', 'Signed in as' — so punctuation between them breaks the sentence the labels
              were built to make.
            */}
            <p className="text-text-primary">
              {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
              {entry.targetLabel ? ` ${entry.targetLabel}` : ''}
            </p>
            {/*
              The actor is on the row even though there is only ever one admin today. The whole point
              of the log is the day that stops being true, and a log that assumes who did it answers
              nothing on that day.
            */}
            <p className="mt-0.5 text-text-secondary">
              {entry.adminEmail || entry.adminUid} · {when(entry.at)}
              {entry.detail ? ` · ${entry.detail}` : ''}
            </p>
          </li>
        ))}
      </ul>

      {entries.length > shown.length && (
        <p className="border-t border-border/40 px-4 py-2.5 text-[11px] text-text-secondary md:px-5">
          Showing the {MAX_ROWS} most recent of {entries.length} loaded.
        </p>
      )}
    </div>
  );
}
