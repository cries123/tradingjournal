import { useCallback, useEffect, useState } from 'react';
import { Ban, Flag, KeyRound, Mail, Trash2, Unplug, User, UserCheck, X } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import { AdminUserPlanSection } from './AdminUserPlanSection';
import { AdminUserUsageSection } from './AdminUserUsageSection';
import { AdminUserEmailComposer } from './AdminUserEmailComposer';
import { AdminUserHistorySection } from './AdminUserHistorySection';
import type { AdminUserSummary } from '../../services/admin';
import { AUDIT_ACTION_LABELS, logAdminAction } from '../../services/adminAuditLog';
import type { AdminUserNote } from '../../services/adminUserNotes';
import type { BugReport } from '../../services/bugReports';
import type { SupportTicket } from '../../services/supportTickets';
import {
  adminDeleteUser,
  adminResetBrokerLink,
  adminSendPasswordResetEmail,
  adminSetSuspended,
  adminUpdateUserEmail,
  adminUpdateUserPassword,
  adminReadUserUsage,
  type UserUsage,
} from '../../services/adminUserManagement';
import { formatCurrency } from '../../utils/format';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { describeAdminActionError } from '../../utils/adminActionError';

interface AdminUserDetailModalProps {
  user: AdminUserSummary;
  adminUid: string;
  adminEmail: string;
  note: AdminUserNote;
  /** This person's own tickets and bug reports, already loaded for the panel's other tabs. */
  tickets: SupportTicket[];
  reports: BugReport[];
  onNoteSave: (patch: { note?: string; flagged?: boolean }) => Promise<AdminUserNote>;
  onClose: () => void;
  onUserUpdated: (uid: string, patch: Partial<AdminUserSummary>) => void;
  onUserDeleted: (uid: string) => void;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? (() => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
      })()
    : new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminUserDetailModal({
  user,
  adminUid,
  adminEmail,
  note,
  tickets,
  reports,
  onNoteSave,
  onClose,
  onUserUpdated,
  onUserDeleted,
}: AdminUserDetailModalProps) {
  useEscapeToClose(onClose);
  const [emailDraft, setEmailDraft] = useState(user.email);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note.note);
  const [noteSaving, setNoteSaving] = useState(false);
  const [flagged, setFlagged] = useState(note.flagged);
  const [confirmBrokerReset, setConfirmBrokerReset] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);
  // Bumped after every action taken here, so the history below picks it up without a reopen.
  const [historyVersion, setHistoryVersion] = useState(0);

  const isSelf = user.uid === adminUid;
  const targetLabel = user.username ? `@${user.username}` : user.email || user.uid;

  const logSelf = (
    action: Parameters<typeof logAdminAction>[0]['action'],
    detail: string,
  ) => {
    void logAdminAction({
      adminUid,
      adminEmail,
      action,
      targetType: 'user',
      targetId: user.uid,
      targetLabel,
      detail,
    }).then(() => setHistoryVersion((v) => v + 1));
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(describeAdminActionError(err));
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    if (noteDraft.trim() === note.note.trim()) return;
    setNoteSaving(true);
    try {
      // Through run(), so a refused write says so here instead of rejecting into the blur handler.
      await run('note', () => onNoteSave({ note: noteDraft }).then(() => undefined));
    } finally {
      setNoteSaving(false);
    }
  };

  const toggleFlag = async () => {
    const next = !flagged;
    setFlagged(next);
    await run('flag', () =>
      onNoteSave({ flagged: next }).then(
        () => undefined,
        (error: unknown) => {
          // The switch already moved. Put it back, or it will claim a state the server rejected.
          setFlagged(!next);
          throw error;
        },
      ),
    );
  };

  /* Metered usage is server-only by rule, so it is fetched on open rather than carried on the
     summary row — and only for the one person being looked at, which keeps it to one query. */
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const reloadUsage = useCallback(async () => {
    setUsage(await adminReadUserUsage(user.uid));
  }, [user.uid]);

  useEffect(() => {
    let cancelled = false;
    void adminReadUserUsage(user.uid).then((u) => {
      if (!cancelled) setUsage(u);
    });
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  const setSuspended = (suspended: boolean) =>
    run('suspend', async () => {
      const result = await adminSetSuspended(user.uid, suspended, suspendReason);
      onUserUpdated(user.uid, { suspended });
      setMessage(result.message);
      setSuspending(false);
      setSuspendReason('');
      logSelf(suspended ? 'user.suspended' : 'user.reactivated', suspended ? suspendReason.trim() || 'No reason given' : 'Sign-in restored');
    });

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
        onClick={onClose}
      >
        <div
          className="glass-card rounded-xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <User size={18} className="text-emerald-400" />
              <h3 id="user-detail-title" className="text-lg font-semibold">
                {user.username ? `@${user.username}` : 'User details'}
              </h3>
              {user.suspended && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-medium uppercase tracking-wide">
                  <Ban size={10} aria-hidden />
                  Suspended
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-secondary hover:text-text-primary"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <dl className="space-y-3 text-sm mb-6">
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Email</dt>
              <dd className="mt-0.5">{user.email || 'Not stored'}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">UID</dt>
              <dd className="mt-0.5 font-mono text-xs break-all">{user.uid}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Signed up</dt>
              <dd className="mt-0.5">{formatDateTime(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Last login</dt>
              <dd className="mt-0.5">{formatDateTime(user.lastLoginAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Trades</dt>
              <dd className="mt-0.5">
                {user.tradeCount > 0 ? `${user.tradeCount} trades` : 'No trades imported'}
                {user.tradesSavedLast7Days > 0 && (
                  <span className="text-text-secondary"> · {user.tradesSavedLast7Days} saved in last 7 days</span>
                )}
                {user.tradesSessionLast7Days > 0 && user.tradesSavedLast7Days === 0 && (
                  <span className="text-text-secondary"> · {user.tradesSessionLast7Days} session trades in last 7 days</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Usage</dt>
              <dd className="mt-0.5">
                {usage === null ? (
                  <span className="text-text-secondary">Loading…</span>
                ) : usage.syncs.total === 0 && usage.ai.total === 0 ? (
                  <span className="text-text-secondary">Never synced or used the assistant</span>
                ) : (
                  <>
                    {usage.syncs.total} broker sync{usage.syncs.total === 1 ? '' : 's'}
                    {usage.syncs.last30 > 0 && (
                      <span className="text-text-secondary"> ({usage.syncs.last30} in 30d)</span>
                    )}
                    {usage.ai.total > 0 && (
                      <>
                        {' · '}
                        {usage.ai.total} AI message{usage.ai.total === 1 ? '' : 's'}
                        {usage.ai.last30 > 0 && (
                          <span className="text-text-secondary"> ({usage.ai.last30} in 30d)</span>
                        )}
                      </>
                    )}
                    {usage.syncs.lastDay && (
                      <span className="text-text-secondary"> · last sync {usage.syncs.lastDay}</span>
                    )}
                  </>
                )}
              </dd>
            </div>
            {user.tradeCount > 0 && user.totalPnl != null && (
              <div>
                <dt className="text-xs text-text-secondary uppercase tracking-wider">Performance</dt>
                <dd className="mt-0.5">
                  <span className={user.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatCurrency(user.totalPnl)} net
                  </span>
                  {user.winRate != null && (
                    <span className="text-text-secondary"> · {user.winRate.toFixed(0)}% win rate</span>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Last journaled</dt>
              <dd className="mt-0.5">
                {user.lastTradeActivityAt ? formatDateTime(user.lastTradeActivityAt) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Sessions</dt>
              <dd className="mt-0.5">
                {user.firstTradeDate || user.lastTradeDate
                  ? `${user.firstTradeDate ? formatDate(user.firstTradeDate) : '—'} → ${
                      user.lastTradeDate ? formatDate(user.lastTradeDate) : '—'
                    }`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary uppercase tracking-wider">Coach share</dt>
              <dd className="mt-0.5">{user.coachShareEnabled ? 'On' : 'Off'}</dd>
            </div>
          </dl>

          <AdminUserPlanSection
            uid={user.uid}
            onDone={(m) => {
              setError(null);
              setMessage(m);
            }}
            onError={(m) => {
              setMessage(null);
              setError(m);
            }}
            onAudit={logSelf}
          />

          <AdminUserUsageSection
            uid={user.uid}
            usage={usage}
            onChanged={reloadUsage}
            onDone={(m) => {
              setError(null);
              setMessage(m);
            }}
            onError={(m) => {
              setMessage(null);
              setError(m);
            }}
            onAudit={logSelf}
          />

          <div className="border-t border-border/50 pt-5 mt-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Account</p>

            <AdminUserEmailComposer
              uid={user.uid}
              email={user.email}
              displayName={user.username ? `@${user.username}` : 'there'}
              onDone={(m) => {
                setError(null);
                setMessage(m);
              }}
              onError={(m) => {
                setMessage(null);
                setError(m);
              }}
              onAudit={logSelf}
            />

            <button
              type="button"
              disabled={!user.email || busy !== null}
              onClick={() =>
                void run('reset', async () => {
                  await adminSendPasswordResetEmail(user.email);
                  setMessage(`Password reset email sent to ${user.email}`);
                  logSelf('user.password-reset-sent', `Sent to ${user.email}`);
                })
              }
              className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm disabled:opacity-50"
            >
              <Mail size={15} />
              {busy === 'reset' ? 'Sending…' : 'Send password reset email'}
            </button>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Change email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className="input-field text-sm flex-1 min-w-0"
                  placeholder="user@example.com"
                />
                <button
                  type="button"
                  disabled={busy !== null || !emailDraft.trim()}
                  onClick={() =>
                    void run('email', async () => {
                      const nextEmail = emailDraft.trim().toLowerCase();
                      const result = await adminUpdateUserEmail(user.uid, emailDraft);
                      onUserUpdated(user.uid, { email: nextEmail });
                      setMessage(result.message);
                      logSelf('user.email-changed', `${user.email || '(none)'} → ${nextEmail}`);
                    })
                  }
                  className="btn-secondary px-3 py-2 text-xs shrink-0 disabled:opacity-50"
                >
                  {busy === 'email' ? '…' : 'Save'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Set new password</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  className="input-field text-sm flex-1 min-w-0"
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  disabled={busy !== null || passwordDraft.length < 6}
                  onClick={() =>
                    void run('password', async () => {
                      const result = await adminUpdateUserPassword(user.uid, passwordDraft);
                      setPasswordDraft('');
                      setMessage(result.message);
                      logSelf('user.password-changed', 'Password manually set by admin');
                    })
                  }
                  className="btn-secondary px-3 py-2 text-xs shrink-0 disabled:opacity-50"
                >
                  <KeyRound size={14} className="inline mr-1" />
                  {busy === 'password' ? '…' : 'Set'}
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmBrokerReset(true)}
              className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm disabled:opacity-50"
            >
              <Unplug size={15} />
              {busy === 'broker' ? 'Resetting…' : 'Reset broker link'}
            </button>

            {!isSelf && !user.suspended && !suspending && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setSuspending(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              >
                <Ban size={15} />
                Suspend sign-in
              </button>
            )}

            {!isSelf && !user.suspended && suspending && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <input
                  type="text"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  maxLength={200}
                  placeholder="Why (kept in the audit trail, not shown to them)"
                  className="input-field text-sm w-full"
                  aria-label="Reason for suspending"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void setSuspended(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <Ban size={14} />
                    {busy === 'suspend' ? 'Suspending…' : 'Suspend now'}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setSuspending(false);
                      setSuspendReason('');
                    }}
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Blocks sign-in and ends any open session within the hour. Their data stays; you can undo it here.
                </p>
              </div>
            )}

            {!isSelf && user.suspended && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void setSuspended(false)}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
              >
                <UserCheck size={15} />
                {busy === 'suspend' ? 'Restoring…' : 'Restore sign-in'}
              </button>
            )}

            {!isSelf && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={15} />
                Delete user
              </button>
            )}

            {message && <p className="text-xs text-emerald-300">{message}</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          <div className="border-t border-border/50 pt-5 mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Internal notes (admin only)
              </p>
              <button
                type="button"
                onClick={() => void toggleFlag()}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  flagged
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-bg-tertiary/60 text-text-secondary hover:text-text-primary'
                }`}
              >
                <Flag size={12} />
                {flagged ? 'Flagged' : 'Flag for review'}
              </button>
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => void saveNote()}
              rows={3}
              placeholder="Only visible to admins — context on this account, past issues, follow-ups…"
              className="input-field text-sm w-full resize-y min-h-[70px]"
              aria-label="Internal admin note"
            />
            <p className="text-[10px] text-text-secondary">
              {noteSaving
                ? 'Saving…'
                : note.updatedAt
                  ? `Last updated ${new Date(note.updatedAt).toLocaleString()}${note.updatedBy ? ` by ${note.updatedBy}` : ''}`
                  : 'Never noted'}
            </p>
          </div>

          <AdminUserHistorySection
            uid={user.uid}
            tickets={tickets}
            reports={reports}
            actionLabels={AUDIT_ACTION_LABELS}
            version={historyVersion}
          />
        </div>
      </div>

      {confirmBrokerReset && (
        <ConfirmDialog
          title="Reset their broker link?"
          message={`Removes ${user.email || user.uid} from SnapTrade and forgets the stored connection, so the next Connect starts clean. Their trades are not touched. They will need to link their broker again.`}
          confirmLabel="Reset link"
          onCancel={() => setConfirmBrokerReset(false)}
          onConfirm={() => {
            setConfirmBrokerReset(false);
            void run('broker', async () => {
              const result = await adminResetBrokerLink(user.uid);
              setMessage(result.message);
              logSelf('user.broker-link-reset', result.hadLink ? 'Link removed; they can reconnect' : 'No link was stored');
            });
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this user?"
          message={`Remove ${user.email || user.uid}? This deletes their trades, profile, and username, and blocks them from signing in.`}
          confirmLabel="Delete user"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void run('delete', async () => {
              await adminDeleteUser(user.uid);
              logSelf('user.deleted', user.email || user.uid);
              onUserDeleted(user.uid);
              setConfirmDelete(false);
              onClose();
            });
          }}
        />
      )}
    </>
  );
}
