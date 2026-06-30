import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  ChevronDown,
  Download,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AuthModal } from '../components/AuthModal';
import { AdminUserDetailModal } from '../components/admin/AdminUserDetailModal';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { useAuth } from '../context/AuthContext';
import {
  buildActivityFeed,
  claimOrVerifyAdmin,
  computeSignupStats,
  computeTopBrokers,
  fetchSignedUpUserCount,
  fetchSignedUpUsers,
  type AdminAccessResult,
  type AdminActivityItem,
  type AdminUserSummary,
} from '../services/admin';
import { exportBrokerRequestsCsv, exportBugReportsCsv, exportUsersCsv } from '../services/adminExport';
import { fetchAdminHealth, type AdminHealthStatus } from '../services/adminHealth';
import {
  fetchBrokerSupportRequests,
  updateBrokerSupportAdminNote,
  updateBrokerSupportStatus,
  type BrokerSupportRequest,
  type BrokerSupportStatus,
} from '../services/brokerSupportRequests';
import {
  fetchBugReports,
  updateBugReportAdminNote,
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

type RequestStatus = BugReportStatus | BrokerSupportStatus;
type StatusFilter = 'all' | RequestStatus;

type AdminState =
  | { phase: 'loading' }
  | { phase: 'unavailable' }
  | { phase: 'auth-required' }
  | { phase: 'denied' }
  | {
      phase: 'ready';
      isNewClaim: boolean;
      reports: BugReport[];
      brokerRequests: BrokerSupportRequest[];
      userCount: number;
      users: AdminUserSummary[];
      health: AdminHealthStatus | null;
    };

const STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
};

function statusBadgeClass(status: RequestStatus): string {
  switch (status) {
    case 'open':
      return 'bg-amber-500/15 text-amber-400';
    case 'resolved':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'closed':
      return 'bg-zinc-500/15 text-zinc-400';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`}
      aria-hidden
    />
  );
}

function AdminNoteField({
  value,
  disabled,
  onSave,
  label,
}: {
  value: string;
  disabled: boolean;
  onSave: (note: string) => Promise<void>;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const save = async () => {
    if (draft.trim() === value.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2 block">
        Admin note
      </label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        disabled={disabled || saving}
        rows={2}
        placeholder="Emailed back, added to roadmap…"
        className="input-field text-sm w-full resize-y min-h-[60px]"
        aria-label={label}
      />
      {saving && <p className="text-[10px] text-text-secondary mt-1">Saving…</p>}
    </div>
  );
}

function ActivityFeedItem({ item }: { item: AdminActivityItem }) {
  const time = formatDateTime(item.at);

  if (item.type === 'signup') {
    return (
      <li className="flex gap-3 text-xs">
        <span className="shrink-0 w-16 text-text-secondary">{time.split(',')[0]}</span>
        <span className="text-emerald-400 font-medium">Signup</span>
        <span className="text-text-secondary truncate">
          {item.username ? `@${item.username}` : item.email || item.uid.slice(0, 8)}
        </span>
      </li>
    );
  }

  if (item.type === 'bug') {
    return (
      <li className="flex gap-3 text-xs">
        <span className="shrink-0 w-16 text-text-secondary">{time.split(',')[0]}</span>
        <span className="text-amber-400 font-medium">Bug</span>
        <span className="text-text-secondary truncate">{item.preview}</span>
      </li>
    );
  }

  return (
    <li className="flex gap-3 text-xs">
      <span className="shrink-0 w-16 text-text-secondary">{time.split(',')[0]}</span>
      <span className="text-cyan-400 font-medium">Broker</span>
      <span className="text-text-secondary truncate">
        {item.brokerName} · {item.email}
      </span>
    </li>
  );
}

function StatusFilterBar({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  const options: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            value === key
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-bg-tertiary/60 text-text-secondary hover:text-text-primary'
          }`}
        >
          {label}
          <span className="ml-1 opacity-70">({counts[key]})</span>
        </button>
      ))}
    </div>
  );
}

export function AdminPage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers }: AdminPageProps) {
  const { user, username, loading, firebaseEnabled, logout } = useAuth();
  const [state, setState] = useState<AdminState>({ phase: 'loading' });
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [bugFilter, setBugFilter] = useState<StatusFilter>('all');
  const [brokerFilter, setBrokerFilter] = useState<StatusFilter>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);

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
      const [reportsResult, brokerResult, userCountResult, usersResult, healthResult] =
        await Promise.allSettled([
          fetchBugReports(),
          fetchBrokerSupportRequests(),
          fetchSignedUpUserCount(),
          fetchSignedUpUsers(),
          fetchAdminHealth(),
        ]);

      setState({
        phase: 'ready',
        isNewClaim: access.isNewClaim,
        reports: reportsResult.status === 'fulfilled' ? reportsResult.value : [],
        brokerRequests: brokerResult.status === 'fulfilled' ? brokerResult.value : [],
        userCount: userCountResult.status === 'fulfilled' ? userCountResult.value : 0,
        users: usersResult.status === 'fulfilled' ? usersResult.value : [],
        health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      });
    } catch {
      setState({
        phase: 'ready',
        isNewClaim: access.isNewClaim,
        reports: [],
        brokerRequests: [],
        userCount: 0,
        users: [],
        health: null,
      });
    }
  }, [firebaseEnabled, loading, user, username]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const handleBugStatusChange = async (reportId: string, status: BugReportStatus) => {
    setUpdatingKey(`bug:${reportId}`);
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
      setUpdatingKey(null);
    }
  };

  const handleBrokerStatusChange = async (requestId: string, status: BrokerSupportStatus) => {
    setUpdatingKey(`broker:${requestId}`);
    try {
      await updateBrokerSupportStatus(requestId, status);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          brokerRequests: prev.brokerRequests.map((r) =>
            r.id === requestId ? { ...r, status } : r,
          ),
        };
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleBugNoteSave = async (reportId: string, adminNote: string) => {
    setUpdatingKey(`bug-note:${reportId}`);
    try {
      await updateBugReportAdminNote(reportId, adminNote);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          reports: prev.reports.map((r) => (r.id === reportId ? { ...r, adminNote } : r)),
        };
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleBrokerNoteSave = async (requestId: string, adminNote: string) => {
    setUpdatingKey(`broker-note:${requestId}`);
    try {
      await updateBrokerSupportAdminNote(requestId, adminNote);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          brokerRequests: prev.brokerRequests.map((r) =>
            r.id === requestId ? { ...r, adminNote } : r,
          ),
        };
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const ready = state.phase === 'ready' ? state : null;

  const signupStats = useMemo(
    () => (ready ? computeSignupStats(ready.users) : null),
    [ready],
  );

  const topBrokers = useMemo(
    () => (ready ? computeTopBrokers(ready.brokerRequests) : []),
    [ready],
  );

  const activityFeed = useMemo(
    () => (ready ? buildActivityFeed(ready.users, ready.reports, ready.brokerRequests) : []),
    [ready],
  );

  const filteredBugs = useMemo(() => {
    if (!ready) return [];
    const sorted = [...ready.reports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (bugFilter === 'all') return sorted;
    return sorted.filter((r) => r.status === bugFilter);
  }, [ready, bugFilter]);

  const filteredBrokers = useMemo(() => {
    if (!ready) return [];
    const sorted = [...ready.brokerRequests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (brokerFilter === 'all') return sorted;
    return sorted.filter((r) => r.status === brokerFilter);
  }, [ready, brokerFilter]);

  const bugFilterCounts = useMemo(() => {
    if (!ready) return { all: 0, open: 0, resolved: 0, closed: 0 };
    return {
      all: ready.reports.length,
      open: ready.reports.filter((r) => r.status === 'open').length,
      resolved: ready.reports.filter((r) => r.status === 'resolved').length,
      closed: ready.reports.filter((r) => r.status === 'closed').length,
    };
  }, [ready]);

  const brokerFilterCounts = useMemo(() => {
    if (!ready) return { all: 0, open: 0, resolved: 0, closed: 0 };
    return {
      all: ready.brokerRequests.length,
      open: ready.brokerRequests.filter((r) => r.status === 'open').length,
      resolved: ready.brokerRequests.filter((r) => r.status === 'resolved').length,
      closed: ready.brokerRequests.filter((r) => r.status === 'closed').length,
    };
  }, [ready]);

  const openBugCount = bugFilterCounts.open;
  const openBrokerCount = brokerFilterCounts.open;
  const openCount = openBugCount + openBrokerCount;

  const usersWithTrades = ready?.users.filter((u) => u.tradeCount > 0).length ?? 0;
  const maxDailySignup = Math.max(1, ...(signupStats?.dailyLast7.map((d) => d.count) ?? [1]));

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

        {state.phase === 'loading' && <p className="text-text-secondary">Checking access…</p>}

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

        {ready && (
          <>
            {ready.isNewClaim && (
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

            {ready.health && (
              <div className="glass-card rounded-xl p-4 md:p-5 mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
                  System health
                </p>
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <HealthDot ok={ready.health.screenshotAi.ok} />
                    <span>Screenshot AI</span>
                    <span className="text-text-secondary text-xs ml-auto">
                      {ready.health.screenshotAi.ok
                        ? ready.health.screenshotAi.hasApiKey
                          ? 'Ready'
                          : 'No API key'
                        : 'Down'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <HealthDot ok={ready.health.benchmark.ok} />
                    <span>SPY benchmark</span>
                    <span className="text-text-secondary text-xs ml-auto">
                      {ready.health.benchmark.ok
                        ? ready.health.benchmark.asOf
                          ? formatDate(ready.health.benchmark.asOf)
                          : 'Live'
                        : 'Unavailable'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <HealthDot ok={ready.health.firebase.ok} />
                    <span>Firebase</span>
                    <span className="text-text-secondary text-xs ml-auto">
                      {ready.health.firebase.ok ? 'Connected' : 'Error'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <div className="glass-card rounded-xl p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Users size={18} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Signed up users
                  </p>
                </div>
                <p className="text-3xl font-bold tracking-tight">{ready.userCount.toLocaleString()}</p>
                {signupStats && (
                  <p className="text-xs text-text-secondary mt-2">
                    {signupStats.last7Days} new in the last 7 days · {signupStats.thisMonth} this month
                  </p>
                )}
                <p className="text-xs text-text-secondary mt-1">
                  {usersWithTrades} with trades imported
                </p>

                {signupStats && signupStats.dailyLast7.some((d) => d.count > 0) && (
                  <div className="mt-4 flex items-end gap-1 h-12">
                    {signupStats.dailyLast7.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-emerald-500/40 rounded-sm min-h-[2px]"
                          style={{ height: `${(day.count / maxDailySignup) * 100}%` }}
                          title={`${day.count} signup${day.count === 1 ? '' : 's'}`}
                        />
                        <span className="text-[9px] text-text-secondary">{day.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                <details className="mt-4 group">
                  <summary className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 cursor-pointer hover:text-emerald-300 list-none [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      size={14}
                      className="transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                    View users ({ready.users.length})
                  </summary>
                  {ready.users.length === 0 ? (
                    <p className="mt-3 text-xs text-text-secondary">No users loaded.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                      {ready.users.map((entry) => (
                        <li key={entry.uid}>
                          <button
                            type="button"
                            onClick={() => setSelectedUser(entry)}
                            className="w-full text-left rounded-lg border border-border/40 bg-bg-tertiary/40 px-3 py-2 text-xs hover:border-emerald-500/30 transition-colors"
                          >
                            <p className="font-semibold text-text-primary">
                              {entry.username ? `@${entry.username}` : 'No username'}
                            </p>
                            <p className="text-text-secondary mt-0.5 truncate">
                              {entry.email || 'Email not stored'}
                            </p>
                            <p className="text-[10px] text-text-secondary mt-1">
                              {entry.tradeCount > 0
                                ? `${entry.tradeCount} trades · last ${formatDate(entry.lastTradeDate)}`
                                : 'No trades'}
                              {entry.lastLoginAt && ` · login ${formatDate(entry.lastLoginAt)}`}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
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
                <p className="text-3xl font-bold tracking-tight">{ready.reports.length.toLocaleString()}</p>
                <p className="text-xs text-text-secondary mt-2">
                  {openBugCount > 0 ? `${openBugCount} open · ` : ''}
                  {ready.reports.filter((r) => r.status === 'resolved').length} resolved
                </p>
              </div>

              <div className="glass-card rounded-xl p-5 md:p-6 sm:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Building2 size={18} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Broker requests
                  </p>
                </div>
                <p className="text-3xl font-bold tracking-tight">
                  {ready.brokerRequests.length.toLocaleString()}
                </p>
                <p className="text-xs text-text-secondary mt-2">
                  {openBrokerCount > 0 ? `${openBrokerCount} open · ` : ''}
                  {ready.brokerRequests.filter((r) => r.status === 'resolved').length} resolved
                </p>
                {topBrokers.length > 0 && (
                  <ul className="mt-4 space-y-1">
                    {topBrokers.map((b) => (
                      <li key={b.name} className="flex justify-between text-xs text-text-secondary">
                        <span>{b.name}</span>
                        <span className="font-medium text-text-primary">{b.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="glass-card rounded-xl p-5 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={16} className="text-emerald-400" />
                  <h2 className="text-sm font-semibold">Recent activity</h2>
                </div>
                {activityFeed.length === 0 ? (
                  <p className="text-xs text-text-secondary">No activity yet.</p>
                ) : (
                  <ul className="space-y-2">{activityFeed.map((item) => (
                    <ActivityFeedItem key={`${item.type}-${item.type === 'signup' ? item.uid : item.id}-${item.at}`} item={item} />
                  ))}</ul>
                )}
              </div>

              <div className="glass-card rounded-xl p-5 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Download size={16} className="text-emerald-400" />
                  <h2 className="text-sm font-semibold">Export</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => exportUsersCsv(ready.users)}
                    className="btn-secondary text-xs px-3 py-2"
                  >
                    Users CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportBugReportsCsv(ready.reports)}
                    className="btn-secondary text-xs px-3 py-2"
                  >
                    Bug reports CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportBrokerRequestsCsv(ready.brokerRequests)}
                    className="btn-secondary text-xs px-3 py-2"
                  >
                    Broker requests CSV
                  </button>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-2">Broker support requests</h2>
            <StatusFilterBar value={brokerFilter} onChange={setBrokerFilter} counts={brokerFilterCounts} />

            {filteredBrokers.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center text-text-secondary text-sm mb-10">
                {ready.brokerRequests.length === 0
                  ? 'No broker support requests yet.'
                  : 'No requests match this filter.'}
              </div>
            ) : (
              <div className="space-y-4 mb-10">
                {filteredBrokers.map((request) => (
                  <article key={request.id} className="glass-card rounded-xl p-5 md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(request.status)}`}
                        >
                          {STATUS_LABELS[request.status]}
                        </span>
                        <p className="text-sm font-semibold mt-2">{request.brokerName}</p>
                        <p className="text-xs text-text-secondary mt-1">
                          {new Date(request.createdAt).toLocaleString()}
                          {' · '}
                          {request.email}
                          {request.username ? ` (@${request.username})` : ''}
                        </p>
                      </div>
                      <select
                        value={request.status}
                        disabled={updatingKey === `broker:${request.id}`}
                        onChange={(e) =>
                          void handleBrokerStatusChange(request.id, e.target.value as BrokerSupportStatus)
                        }
                        className="input-field text-sm py-1.5 px-2 min-w-[120px]"
                        aria-label="Update broker request status"
                      >
                        <option value="open">Open</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{request.exportMethod}</p>

                    {request.details && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                          Additional details
                        </p>
                        <p className="text-sm text-text-secondary whitespace-pre-wrap">{request.details}</p>
                      </div>
                    )}

                    <AdminNoteField
                      value={request.adminNote ?? ''}
                      disabled={updatingKey === `broker-note:${request.id}`}
                      onSave={(note) => handleBrokerNoteSave(request.id, note)}
                      label="Broker request admin note"
                    />
                  </article>
                ))}
              </div>
            )}

            <h2 className="text-lg font-semibold mb-2">Bug reports</h2>
            <StatusFilterBar value={bugFilter} onChange={setBugFilter} counts={bugFilterCounts} />

            {filteredBugs.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center text-text-secondary text-sm">
                {ready.reports.length === 0 ? 'No bug reports yet.' : 'No reports match this filter.'}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBugs.map((report) => (
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
                        disabled={updatingKey === `bug:${report.id}`}
                        onChange={(e) =>
                          void handleBugStatusChange(report.id, e.target.value as BugReportStatus)
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

                    <AdminNoteField
                      value={report.adminNote ?? ''}
                      disabled={updatingKey === `bug-note:${report.id}`}
                      onSave={(note) => handleBugNoteSave(report.id, note)}
                      label="Bug report admin note"
                    />
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {selectedUser && user && (
        <AdminUserDetailModal
          user={selectedUser}
          adminUid={user.uid}
          onClose={() => setSelectedUser(null)}
          onUserUpdated={(uid, patch) => {
            setState((prev) => {
              if (prev.phase !== 'ready') return prev;
              return {
                ...prev,
                users: prev.users.map((u) => (u.uid === uid ? { ...u, ...patch } : u)),
              };
            });
            setSelectedUser((prev) => (prev?.uid === uid ? { ...prev, ...patch } : prev));
          }}
          onUserDeleted={(uid) => {
            setState((prev) => {
              if (prev.phase !== 'ready') return prev;
              return {
                ...prev,
                users: prev.users.filter((u) => u.uid !== uid),
                userCount: Math.max(0, prev.userCount - 1),
              };
            });
            setSelectedUser(null);
          }}
        />
      )}

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} />
    </div>
  );
}