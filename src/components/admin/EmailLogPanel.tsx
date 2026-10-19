import { Mail } from 'lucide-react';
import type { EmailLogEntry } from '../../../server/emailLog';
import { relativeTime } from '../../utils/relativeTime';
import { AdminUserRef } from './AdminUserRef';

/**
 * Every email the product sent, newest first.
 *
 * Eleven kinds of mail go out and there was no record of any of them. A row per send, with the
 * feature that sent it and whether the provider took it, so "did it go out" has an answer. The
 * same rows appear on a user's card, filtered to their address.
 */
export function EmailLogPanel({
  emails,
  now,
  mailConfigured,
  uidFor,
  labelFor,
  onOpenUser,
  canOpenUser,
}: {
  emails: EmailLogEntry[];
  now: number;
  mailConfigured: boolean;
  /** The account behind an address, from the loaded user list; null for an outside address. */
  uidFor: (email: string) => string | null;
  labelFor: (uid: string) => string;
  onOpenUser?: (uid: string) => void;
  canOpenUser?: (uid: string) => boolean;
}) {
  return (
    <section className="panel-card rounded-xl p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Emails sent</h2>
        </div>
        <p className={`text-xs ${mailConfigured ? 'text-text-secondary' : 'text-amber-300'}`}>
          {mailConfigured ? 'Mail provider configured' : 'No mail provider configured — nothing is being sent'}
        </p>
      </div>
      <p className="text-xs text-text-secondary mb-3">Every send, sent or not, with the feature behind it.</p>

      {emails.length === 0 ? (
        <p className="text-xs text-text-secondary">No sends recorded yet. The log starts from the release that added it.</p>
      ) : (
        <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
          {emails.map((row) => {
            const uid = uidFor(row.to);
            return (
              <li key={row.id ?? `${row.to}-${row.at}`} className="rounded-lg border border-border/40 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="tabular-nums text-text-secondary">{relativeTime(row.at, now)}</span>
                  {uid ? (
                    <AdminUserRef uid={uid} onOpen={onOpenUser} canOpen={canOpenUser} className="font-medium text-text-primary">
                      {labelFor(uid)}
                    </AdminUserRef>
                  ) : (
                    <span className="font-medium text-text-primary">{row.to}</span>
                  )}
                  {row.tag && <span className="rounded bg-bg-primary/60 px-1 font-mono text-[10px] text-text-secondary">{row.tag}</span>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.sent ? 'bg-accent/15 text-accent' : 'bg-red-500/15 text-red-400'}`}>
                    {row.sent ? 'Sent' : `Not sent · ${row.reason ?? 'unknown'}`}
                  </span>
                </div>
                <p className="text-xs mt-0.5 truncate" title={row.subject}>{row.subject}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
