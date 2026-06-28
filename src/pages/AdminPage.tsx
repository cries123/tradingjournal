import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Lock, ShieldCheck, Users } from 'lucide-react';
import { AuthModal } from '../components/AuthModal';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { useAuth } from '../context/AuthContext';
import { claimOrVerifyAdmin, fetchSignedUpUserCount, type AdminAccessResult } from '../services/admin';
import {
  fetchBugReports,
  updateBugReportStatus,
  type BugReport,
  type BugReportStatus,
} from '../services/bugReports';

interface AdminPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
}

type AdminState =
  | { phase: 'loading' }
  | { phase: 'unavailable' }
  | { phase: 'auth-required' }
  | { phase: 'denied' }
  | { phase: 'ready'; isNewClaim: boolean; reports: BugReport[]; userCount: number };

const STATUS_LABELS: Record<BugReportStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
};

function statusBadgeClass(status: BugReportStatus): string {
  switch (status) {
    case 'open':
      return 'bg-amber-500/15 text-amber-400';
    case 'resolved':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'closed':
      return 'bg-zinc-500/15 text-zinc-400';
  }
}

export function AdminPage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers }: AdminPageProps) {
  const { user, username, loading, firebaseEnabled, logout } = useAuth();
  const [state, setState] = useState<AdminState>({ phase: 'loading' });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    if (!firebaseEnabled) {
      setState({ phase: 'unavailable' });
      return;
    }

    if (loading) {
      setState({ phase: 'loading' });
      return;
    }

    if (!user) {
      setState({ phase: 'auth-required' });
      return;
    }

    setState({ phase: 'loading' });

    let access: AdminAccessResult;
    try {
      access = await claimOrVerifyAdmin(user.uid, user.email ?? '', username);
    } catch {
      setState({ phase: 'denied' });
      return;
    }

    if (!access.ok) {
      setState({ phase: access.reason === 'not-configured' ? 'unavailable' : 'denied' });
      return;
    }

    try {
      const [reports, userCount] = await Promise.all([fetchBugReports(), fetchSignedUpUserCount()]);
      setState({ phase: 'ready', isNewClaim: access.isNewClaim, reports, userCount });
    } catch {
      setState({ phase: 'ready', isNewClaim: access.isNewClaim, reports: [], userCount: 0 });
    }
  }, [firebaseEnabled, loading, user, username]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const handleStatusChange = async (reportId: string, status: BugReportStatus) => {
    setUpdatingId(reportId);
    try {
      await updateBugReportStatus(reportId, status);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          reports: prev.reports.map((r) => (r.id === reportId ? { ...r, status } : r)),
        };
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const openCount =
    state.phase === 'ready' ? state.reports.filter((r) => r.status === 'open').length : 0;

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} />

      {state.phase === 'auth-required' && firebaseEnabled && !loading && !user && <AuthModal />}

      <main className="relative z-10 flex-1 max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16 w-full">
        <button
          type="button"
          onClick={onHome}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to home
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Admin</h1>
        </div>

        {state.phase === 'loading' && (
          <p className="text-text-secondary">Checking access…</p>
        )}

        {state.phase === 'unavailable' && (
          <div className="glass-card rounded-xl p-6 text-sm text-text-secondary">
            Admin panel is unavailable — Firebase is not configured for this environment.
          </div>
        )}

        {state.phase === 'auth-required' && (
          <div className="glass-card rounded-xl p-6 text-sm text-text-secondary">
            Sign in to access the admin panel. The first account to sign in here becomes the site
            administrator.
          </div>
        )}

        {state.phase === 'denied' && (
          <div className="glass-card rounded-xl p-8 text-center max-w-lg">
            <Lock size={36} className="mx-auto text-red-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access denied</h2>
            <p className="text-text-secondary text-sm mb-6">
              An administrator has already been registered for this site. Only that account can access
              this panel.
            </p>
            {user && (
              <button type="button" onClick={() => void logout()} className="btn-secondary text-sm px-5 py-2.5">
                Sign out ({user.email})
              </button>
            )}
          </div>
        )}

        {state.phase === 'ready' && (
          <>
            {state.isNewClaim && (
              <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                You are now the site administrator. This account is the only one that can access this
                panel going forward.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <p className="text-text-secondary text-sm">
                Signed in as {user?.email}
                {username ? ` (@${username})` : ''}
                {openCount > 0 && (
                  <span className="ml-2 inline-flex px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-medium">
                    {openCount} open
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => void loadAdmin()}
                className="text-sm text-text-secondary hover:text-emerald-400 transition-colors"
              >
                Refresh
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              <div className="glass-card rounded-xl p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Users size={18} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Signed up users
                  </p>
                </div>
                <p className="text-3xl font-bold tracking-tight">{state.userCount.toLocaleString()}</p>
                <p className="text-xs text-text-secondary mt-2">Accounts with a Trend Chasers profile</p>
              </div>

              <div className="glass-card rounded-xl p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                    <ShieldCheck size={18} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Bug reports
                  </p>
                </div>
                <p className="text-3xl font-bold tracking-tight">{state.reports.length.toLocaleString()}</p>
                <p className="text-xs text-text-secondary mt-2">
                  {openCount > 0 ? `${openCount} open · ` : ''}
                  {state.reports.filter((r) => r.status === 'resolved').length} resolved
                </p>
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4">Bug reports</h2>

            {state.reports.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center text-text-secondary text-sm">
                No bug reports yet.
              </div>
            ) : (
              <div className="space-y-4">
                {state.reports.map((report) => (
                  <article key={report.id} className="glass-card rounded-xl p-5 md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(report.status)}`}
                        >
                          {STATUS_LABELS[report.status]}
                        </span>
                        <p className="text-xs text-text-secondary mt-2">
                          {new Date(report.createdAt).toLocaleString()}
                          {' · '}
                          {report.email}
                          {report.username ? ` (@${report.username})` : ''}
                        </p>
                      </div>
                      <select
                        value={report.status}
                        disabled={updatingId === report.id}
                        onChange={(e) =>
                          void handleStatusChange(report.id, e.target.value as BugReportStatus)
                        }
                        className="input-field text-sm py-1.5 px-2 min-w-[120px]"
                        aria-label="Update report status"
                      >
                        <option value="open">Open</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{report.description}</p>

                    {report.steps && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                          Steps to reproduce
                        </p>
                        <p className="text-sm text-text-secondary whitespace-pre-wrap">{report.steps}</p>
                      </div>
                    )}

                    {report.pageUrl && (
                      <p className="mt-3 text-xs text-text-secondary truncate">
                        Page:{' '}
                        <a href={report.pageUrl} className="text-emerald-400 hover:underline">
                          {report.pageUrl}
                        </a>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} />
    </div>
  );
}
