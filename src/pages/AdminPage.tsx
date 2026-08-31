import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  Download,
  Eye,
  Flag,
  History,
  LifeBuoy,
  Link2,
  Lock,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AuthModal } from '../components/AuthModal';
import { HELP_STARTER_ARTICLES } from '../data/helpStarterArticles';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { BUILD_SHA, BUILD_TIME, formatBuildStamp } from '../config/build';
import { AcquisitionFunnel } from '../components/admin/AcquisitionFunnel';
import { BrokerAdoptionPanel } from '../components/admin/BrokerAdoptionPanel';
import { SignupTrendPanel } from '../components/admin/SignupTrendPanel';
import { AdminAnnouncementCard } from '../components/admin/AdminAnnouncementCard';
import { AdminCheckoutCard } from '../components/admin/AdminCheckoutCard';
import { AdminUserDetailModal } from '../components/admin/AdminUserDetailModal';
import { AdminHelpArticleModal } from '../components/admin/AdminHelpArticleModal';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { useAuth } from '../context/AuthContext';
import type { ExtraNavRoute } from '../hooks/useRoute';
import {
  buildActivityFeed,
  claimOrVerifyAdmin,
  computePlatformStats,
  computeSignupStats,
  computeTopBrokers,
  fetchSignedUpUsers,
  type AdminAccessResult,
  type AdminActivityItem,
  type AdminUserSummary,
} from '../services/admin';
import { formatCurrency } from '../utils/format';
import { exportBrokerRequestsCsv, exportBugReportsCsv, exportUsersCsv } from '../services/adminExport';
import {
  fetchAdminHealth,
  fetchAdminHealthHistory,
  recordAdminHealthSnapshot,
  type AdminHealthSnapshot,
  type AdminHealthStatus,
} from '../services/adminHealth';
import { fetchAllAdminUserNotes, saveAdminUserNote, type AdminUserNote } from '../services/adminUserNotes';
import { fetchRecentAuditLog, logAdminAction, type AdminAuditEntry } from '../services/adminAuditLog';
import {
  fetchAllHelpArticles,
  helpCategoryLabel,
  createHelpArticle,
  updateHelpArticle,
  HELP_CATEGORIES,
  type HelpArticleCategory,
  type HelpArticle,
} from '../services/adminHelpArticles';
import type { AdminPriority } from '../services/adminShared';
import {
  fetchBrokerSupportRequests,
  updateBrokerSupportAdminNote,
  updateBrokerSupportPriority,
  updateBrokerSupportStatus,
  type BrokerSupportRequest,
  type BrokerSupportStatus,
} from '../services/brokerSupportRequests';
import {
  fetchBugReports,
  updateBugReportAdminNote,
  updateBugReportPriority,
  updateBugReportStatus,
  type BugReport,
  type BugReportStatus,
} from '../services/bugReports';
import {
  emptyVisitorStats,
  fetchVisitorStats,
  type VisitorStats,
} from '../services/visitorAnalytics';
import {
  fetchAdminServerStats,
  type AdminBrokerUser,
  type AdminServerStats,
} from '../services/adminStats';

interface AdminPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

type RequestStatus = BugReportStatus | BrokerSupportStatus;
type StatusFilter = 'all' | RequestStatus;

type UserSortKey = 'activity' | 'login' | 'trades' | 'newest' | 'name';

const USER_SORTS: { key: UserSortKey; label: string }[] = [
  { key: 'activity', label: 'Recent journaling' },
  { key: 'login', label: 'Recent login' },
  { key: 'trades', label: 'Most trades' },
  { key: 'newest', label: 'Newest signup' },
  { key: 'name', label: 'Name A–Z' },
];

function timeValue(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortUsers(users: AdminUserSummary[], sort: UserSortKey): AdminUserSummary[] {
  const sorted = [...users];
  switch (sort) {
    case 'activity':
      sorted.sort((a, b) => timeValue(b.lastTradeActivityAt) - timeValue(a.lastTradeActivityAt));
      break;
    case 'login':
      sorted.sort((a, b) => timeValue(b.lastLoginAt) - timeValue(a.lastLoginAt));
      break;
    case 'trades':
      sorted.sort((a, b) => b.tradeCount - a.tradeCount);
      break;
    case 'newest':
      sorted.sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
      break;
    case 'name':
      sorted.sort((a, b) => {
        const aLabel = a.username ?? a.email ?? a.uid;
        const bLabel = b.username ?? b.email ?? b.uid;
        return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
      });
      break;
  }
  return sorted;
}

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
      visitorStats: VisitorStats;
      visitorStatsError: string | null;
      serverStats: AdminServerStats | null;
      serverStatsError: string | null;
      userNotes: Map<string, AdminUserNote>;
      auditLog: AdminAuditEntry[];
      healthHistory: AdminHealthSnapshot[];
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

const PRIORITY_LABELS: Record<AdminPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const PRIORITY_RANK: Record<AdminPriority, number> = { high: 0, medium: 1, low: 2 };

function priorityBadgeClass(priority: AdminPriority): string {
  switch (priority) {
    case 'high':
      return 'bg-red-500/15 text-red-400';
    case 'medium':
      return 'bg-amber-500/15 text-amber-400';
    case 'low':
      return 'bg-zinc-500/15 text-zinc-400';
  }
}

function PrioritySelect({
  value,
  disabled,
  onChange,
}: {
  value: AdminPriority;
  disabled: boolean;
  onChange: (priority: AdminPriority) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as AdminPriority)}
      className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border-0 cursor-pointer ${priorityBadgeClass(value)}`}
      aria-label="Set priority"
    >
      <option value="low">Low priority</option>
      <option value="medium">Medium priority</option>
      <option value="high">High priority</option>
    </select>
  );
}

/** Small left-to-right strip of recent up/down checks, oldest to newest, with a rolling uptime %. */
function HealthTimeline({ label, values }: { label: string; values: boolean[] }) {
  if (values.length === 0) return null;
  const upCount = values.filter(Boolean).length;
  const uptimePct = (upCount / values.length) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-[10px] text-text-secondary">
          {uptimePct.toFixed(0)}% of last {values.length}
        </span>
      </div>
      <div className="flex gap-0.5" role="img" aria-label={`${label}: ${uptimePct.toFixed(0)}% healthy`}>
        {values.map((ok, i) => (
          <span
            key={i}
            className={`h-4 flex-1 rounded-[2px] ${ok ? 'bg-emerald-400/70' : 'bg-red-400/80'}`}
          />
        ))}
      </div>
    </div>
  );
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

const AUDIT_ACTION_LABELS: Record<AdminAuditEntry['action'], string> = {
  'user.email-changed': 'Changed email for',
  'user.password-changed': 'Set a new password for',
  'user.password-reset-sent': 'Sent password reset to',
  'user.deleted': 'Deleted user',
  'announcement.published': 'Updated the site announcement',
  'checkout.toggled': 'Changed plan checkout availability',
  'user.tier-granted': 'Granted a plan to',
  'user.tier-grant-cleared': 'Removed the granted plan from',
  'user.note-saved': 'Updated internal note for',
  'user.flagged': 'Flagged',
  'user.unflagged': 'Unflagged',
  'bug.status-changed': 'Updated status on bug report',
  'bug.priority-changed': 'Changed priority on bug report',
  'bug.note-saved': 'Added a note to bug report',
  'broker-request.status-changed': 'Updated status on broker request',
  'broker-request.priority-changed': 'Changed priority on broker request',
  'broker-request.note-saved': 'Added a note to broker request',
  'help-article.created': 'Created help article',
  'help-article.updated': 'Edited help article',
  'help-article.published': 'Published help article',
  'help-article.unpublished': 'Unpublished help article',
  'help-article.deleted': 'Deleted help article',
};

function AuditLogItem({ entry }: { entry: AdminAuditEntry }) {
  const time = new Date(entry.at).toLocaleString();
  return (
    <li className="text-xs border-l-2 border-border/50 pl-3">
      <p className="text-text-primary">
        {AUDIT_ACTION_LABELS[entry.action]}{' '}
        <span className="font-medium">{entry.targetLabel || entry.targetId.slice(0, 8)}</span>
      </p>
      <p className="text-text-secondary mt-0.5">
        {entry.detail} · {time}
      </p>
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

type AdminTab = 'overview' | 'users' | 'requests' | 'content';

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'requests', label: 'Requests' },
  { id: 'content', label: 'Content' },
];

/**
 * Splits the panel into four views instead of one continuous scroll.
 *
 * A dozen panels here serve three unrelated jobs — is the site healthy, how is it growing, and
 * what needs me. Stacked in one column they read as a single undifferentiated list, and the two
 * sections with actual work in them sat at the very bottom, furthest from where you land.
 * Grouping by job is most of the fix; the badge does the rest, making "something needs you"
 * visible from every tab instead of only after scrolling to it.
 */
function AdminTabBar({
  tab,
  onChange,
  openCount,
  userCount,
}: {
  tab: AdminTab;
  onChange: (tab: AdminTab) => void;
  openCount: number;
  userCount: number;
}) {
  const badgeFor = (id: AdminTab): string | null => {
    if (id === 'requests' && openCount > 0) return String(openCount);
    if (id === 'users') return String(userCount);
    return null;
  };

  return (
    <div className="flex items-center gap-1 border-b border-border/60 mb-6 overflow-x-auto">
      {ADMIN_TABS.map((t) => {
        const active = t.id === tab;
        const badge = badgeFor(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative shrink-0 px-3.5 py-2.5 text-sm font-medium transition-colors focus-ring rounded-t-lg ${
              active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {t.label}
              {badge && (
                <span
                  className={`text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 ${
                    t.id === 'requests'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  {badge}
                </span>
              )}
            </span>
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The one strip that answers "is there anything I have to do right now".
 *
 * Renders nothing when everything is fine, deliberately. A banner that is always present stops
 * being read; one that appears only when it has something to say keeps its meaning.
 */
function NeedsAttention({
  openBugs,
  openBrokers,
  health,
  onGoToRequests,
}: {
  openBugs: number;
  openBrokers: number;
  health: AdminHealthStatus | null;
  onGoToRequests: () => void;
}) {
  const down: string[] = [];
  if (health) {
    if (!health.brokerSync.ok) down.push('Broker sync');
    if (!health.benchmark.ok) down.push('SPY benchmark');
    if (!health.firebase.ok) down.push('Firebase');
    if (!health.payments.ok) down.push('Payments');
  }

  const waiting: string[] = [];
  if (openBugs > 0) waiting.push(`${openBugs} open bug report${openBugs === 1 ? '' : 's'}`);
  if (openBrokers > 0) {
    waiting.push(`${openBrokers} broker request${openBrokers === 1 ? '' : 's'}`);
  }

  if (waiting.length === 0 && down.length === 0) return null;

  const critical = down.length > 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 mb-5 ${
        critical ? 'border-red-500/30 bg-red-500/5' : 'border-amber-400/25 bg-amber-400/5'
      }`}
    >
      <AlertTriangle
        size={15}
        className={`shrink-0 ${critical ? 'text-red-400' : 'text-amber-400'}`}
      />
      <p className="text-sm text-text-primary flex-1 min-w-[200px]">
        {down.length > 0 && (
          <span className="font-semibold">
            {down.join(' and ')} {down.length === 1 ? 'is' : 'are'} down.
          </span>
        )}
        {down.length > 0 && waiting.length > 0 && ' '}
        {waiting.length > 0 && (
          <span className="text-text-secondary">{waiting.join(' \u00b7 ')} waiting.</span>
        )}
      </p>
      {waiting.length > 0 && (
        <button
          type="button"
          onClick={onGoToRequests}
          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors focus-ring rounded shrink-0"
        >
          Review &rarr;
        </button>
      )}
    </div>
  );
}

/** CSV exports collapsed into one control. They were a full panel competing with real data. */
function ExportMenu({
  onUsers,
  onBugs,
  onBrokers,
}: {
  onUsers: () => void;
  onBugs: () => void;
  onBrokers: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEscapeToClose(() => setOpen(false));

  const items = [
    { label: 'Users CSV', run: onUsers },
    { label: 'Bug reports CSV', run: onBugs },
    { label: 'Broker requests CSV', run: onBrokers },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-emerald-400/40 transition-colors focus-ring"
      >
        <Download size={13} />
        Export
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close export menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-full mt-1.5 z-40 w-44 rounded-lg border border-border bg-bg-secondary shadow-xl py-1">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.run();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AdminPage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers, onGuides, onNavigate }: AdminPageProps) {
  const { user, username, loading, firebaseEnabled, logout } = useAuth();
  const [state, setState] = useState<AdminState>({ phase: 'loading' });
  const [tab, setTab] = useState<AdminTab>('overview');
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [bugFilter, setBugFilter] = useState<StatusFilter>('all');
  const [brokerFilter, setBrokerFilter] = useState<StatusFilter>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [userSearch, setUserSearch] = useState('');
  /** Narrows the list to people who actually have a brokerage linked. */
  const [brokerOnly, setBrokerOnly] = useState(false);
  const [userSort, setUserSort] = useState<UserSortKey>('activity');
  const [helpArticles, setHelpArticles] = useState<HelpArticle[]>([]);
  const [articleBusy, setArticleBusy] = useState<string | null>(null);
  const [articleModal, setArticleModal] = useState<'new' | HelpArticle | null>(null);

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
      const [reportsResult, brokerResult, usersResult, healthResult, notesResult, auditResult, healthHistoryResult] =
        await Promise.allSettled([
          fetchBugReports(),
          fetchBrokerSupportRequests(),
          fetchSignedUpUsers(),
          fetchAdminHealth(),
          fetchAllAdminUserNotes(),
          fetchRecentAuditLog(),
          fetchAdminHealthHistory(),
        ]);

      const users =
        usersResult.status === 'fulfilled' ? usersResult.value : [];
      const userCount = users.length;
      const signupStats = computeSignupStats(users);
      const [visitorResult, serverResult] = await Promise.all([
        fetchVisitorStats(signupStats.last7Days).catch(() => ({
          stats: emptyVisitorStats(signupStats.last7Days),
          error: 'Could not load visitor stats',
        })),
        fetchAdminServerStats(),
      ]);

      const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
      if (health) void recordAdminHealthSnapshot(health);

      setState({
        phase: 'ready',
        isNewClaim: access.isNewClaim,
        reports: reportsResult.status === 'fulfilled' ? reportsResult.value : [],
        brokerRequests: brokerResult.status === 'fulfilled' ? brokerResult.value : [],
        userCount,
        users,
        health,
        visitorStats: visitorResult.stats,
        visitorStatsError: visitorResult.error,
        serverStats: serverResult.stats,
        serverStatsError: serverResult.error,
        userNotes: notesResult.status === 'fulfilled' ? notesResult.value : new Map(),
        auditLog: auditResult.status === 'fulfilled' ? auditResult.value : [],
        healthHistory: healthHistoryResult.status === 'fulfilled' ? healthHistoryResult.value : [],
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
        visitorStats: emptyVisitorStats(0),
        visitorStatsError: null,
        serverStats: null,
        serverStatsError: null,
        userNotes: new Map(),
        auditLog: [],
        healthHistory: [],
      });
    }
  }, [firebaseEnabled, loading, user, username]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    let cancelled = false;
    void fetchAllHelpArticles().then((list) => {
      if (!cancelled) setHelpArticles(list);
    });
    return () => {
      cancelled = true;
    };
  }, [state.phase]);

  const adminIdentity = { adminUid: user?.uid ?? '', adminEmail: user?.email ?? '' };

  const handleBugStatusChange = async (reportId: string, status: BugReportStatus, label: string) => {
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
      void logAdminAction({
        ...adminIdentity,
        action: 'bug.status-changed',
        targetType: 'bug-report',
        targetId: reportId,
        targetLabel: label,
        detail: `Status → ${STATUS_LABELS[status]}`,
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleBugPriorityChange = async (reportId: string, priority: AdminPriority, label: string) => {
    setUpdatingKey(`bug-priority:${reportId}`);
    try {
      await updateBugReportPriority(reportId, priority);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          reports: prev.reports.map((r) => (r.id === reportId ? { ...r, priority } : r)),
        };
      });
      void logAdminAction({
        ...adminIdentity,
        action: 'bug.priority-changed',
        targetType: 'bug-report',
        targetId: reportId,
        targetLabel: label,
        detail: `Priority → ${PRIORITY_LABELS[priority]}`,
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleBrokerStatusChange = async (requestId: string, status: BrokerSupportStatus, label: string) => {
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
      void logAdminAction({
        ...adminIdentity,
        action: 'broker-request.status-changed',
        targetType: 'broker-request',
        targetId: requestId,
        targetLabel: label,
        detail: `Status → ${STATUS_LABELS[status]}`,
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleBrokerPriorityChange = async (requestId: string, priority: AdminPriority, label: string) => {
    setUpdatingKey(`broker-priority:${requestId}`);
    try {
      await updateBrokerSupportPriority(requestId, priority);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          brokerRequests: prev.brokerRequests.map((r) =>
            r.id === requestId ? { ...r, priority } : r,
          ),
        };
      });
      void logAdminAction({
        ...adminIdentity,
        action: 'broker-request.priority-changed',
        targetType: 'broker-request',
        targetId: requestId,
        targetLabel: label,
        detail: `Priority → ${PRIORITY_LABELS[priority]}`,
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleBugNoteSave = async (reportId: string, adminNote: string, label: string) => {
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
      void logAdminAction({
        ...adminIdentity,
        action: 'bug.note-saved',
        targetType: 'bug-report',
        targetId: reportId,
        targetLabel: label,
        detail: 'Admin note updated',
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleBrokerNoteSave = async (requestId: string, adminNote: string, label: string) => {
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
      void logAdminAction({
        ...adminIdentity,
        action: 'broker-request.note-saved',
        targetType: 'broker-request',
        targetId: requestId,
        targetLabel: label,
        detail: 'Admin note updated',
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleUserNoteSave = async (uid: string, patch: { note?: string; flagged?: boolean }, label: string) => {
    const saved = await saveAdminUserNote(uid, patch, user?.email ?? '');
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      const nextNotes = new Map(prev.userNotes);
      nextNotes.set(uid, saved);
      return { ...prev, userNotes: nextNotes };
    });
    if (patch.flagged !== undefined) {
      void logAdminAction({
        ...adminIdentity,
        action: patch.flagged ? 'user.flagged' : 'user.unflagged',
        targetType: 'user',
        targetId: uid,
        targetLabel: label,
        detail: patch.flagged ? 'Flagged for review' : 'Flag cleared',
      });
    } else {
      void logAdminAction({
        ...adminIdentity,
        action: 'user.note-saved',
        targetType: 'user',
        targetId: uid,
        targetLabel: label,
        detail: 'Admin note updated',
      });
    }
    return saved;
  };

  /**
   * Re-files an article without opening the editor.
   *
   * Fixing a mis-categorised Help Center used to mean opening each article, changing a dropdown,
   * saving, and closing — four steps to change one field. The category is the one property you
   * change in bulk, so it belongs in the list.
   */
  const handleArticleCategoryChange = useCallback(
    async (article: HelpArticle, category: HelpArticleCategory) => {
      if (category === article.category || !user) return;
      setArticleBusy(article.id);
      // Optimistic: the dropdown should settle immediately, and a failure puts it back.
      setHelpArticles((prev) => prev.map((a) => (a.id === article.id ? { ...a, category } : a)));
      try {
        await updateHelpArticle(article.id, { category }, user.email ?? '');
      } catch (err) {
        console.error('[admin] re-categorising article failed:', err);
        setHelpArticles((prev) =>
          prev.map((a) => (a.id === article.id ? { ...a, category: article.category } : a)),
        );
      } finally {
        setArticleBusy(null);
      }
    },
    [user],
  );

  /** Adds any starter article the Help Center doesn't already have. Matched by title so pressing
   *  it twice does nothing the second time. */
  const handleAddStarterArticles = useCallback(async () => {
    if (!user) return;
    const existing = new Set(helpArticles.map((a) => a.title.trim().toLowerCase()));
    const missing = HELP_STARTER_ARTICLES.filter((a) => !existing.has(a.title.trim().toLowerCase()));
    if (missing.length === 0) return;

    setArticleBusy('starter');
    try {
      for (const draft of missing) {
        // Created as a draft, not published: it's your Help Center, so you read it before your
        // users do.
        const created = await createHelpArticle({ ...draft, published: false }, user.email ?? '');
        setHelpArticles((prev) => [created, ...prev]);
      }
    } catch (err) {
      console.error('[admin] adding starter articles failed:', err);
    } finally {
      setArticleBusy(null);
    }
  }, [user, helpArticles]);

  const missingStarterCount = useMemo(() => {
    const existing = new Set(helpArticles.map((a) => a.title.trim().toLowerCase()));
    return HELP_STARTER_ARTICLES.filter((a) => !existing.has(a.title.trim().toLowerCase())).length;
  }, [helpArticles]);

  const ready = state.phase === 'ready' ? state : null;

  const signupStats = useMemo(
    () => (ready ? computeSignupStats(ready.users) : null),
    [ready],
  );

  const platformStats = useMemo(
    () => (ready ? computePlatformStats(ready.users) : null),
    [ready],
  );

  /*
   * Who actually has a brokerage linked, keyed by uid.
   *
   * The stats endpoint already asks SnapTrade this to produce the "Connected a broker" total, and
   * used to throw the per-user answers away — so the panel could say "2 connected" without being
   * able to say which two. Only users who ever started the connect flow appear; anyone missing is
   * simply not connected.
   */
  const brokerByUid = useMemo(() => {
    const map = new Map<string, AdminBrokerUser>();
    for (const row of ready?.serverStats?.brokerUsers ?? []) map.set(row.uid, row);
    return map;
  }, [ready?.serverStats?.brokerUsers]);

  /* False whenever the stats call failed or an older function build is deployed — in that case the
     rows say nothing rather than claiming nobody is connected. */
  const brokerDataLoaded = (ready?.serverStats?.brokerUsers?.length ?? 0) > 0
    || (ready?.serverStats?.brokerRegisteredCount ?? 0) === 0;

  const visibleUsers = useMemo(() => {
    if (!ready) return [];
    const term = userSearch.trim().toLowerCase();
    const matched = term
      ? ready.users.filter(
          (u) =>
            u.username?.toLowerCase().includes(term)
            || u.email.toLowerCase().includes(term)
            || u.uid.toLowerCase().includes(term),
        )
      : ready.users;
    const scoped = brokerOnly
      ? matched.filter((u) => brokerByUid.get(u.uid)?.connected)
      : matched;
    return sortUsers(scoped, userSort);
  }, [ready, userSearch, userSort, brokerOnly, brokerByUid]);

  const connectedCount = useMemo(
    () => (ready?.users ?? []).filter((u) => brokerByUid.get(u.uid)?.connected).length,
    [ready?.users, brokerByUid],
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
    const sorted = [...ready.reports].sort((a, b) => {
      const priorityDiff = PRIORITY_RANK[a.priority ?? 'medium'] - PRIORITY_RANK[b.priority ?? 'medium'];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    if (bugFilter === 'all') return sorted;
    return sorted.filter((r) => r.status === bugFilter);
  }, [ready, bugFilter]);

  const filteredBrokers = useMemo(() => {
    if (!ready) return [];
    const sorted = [...ready.brokerRequests].sort((a, b) => {
      const priorityDiff = PRIORITY_RANK[a.priority ?? 'medium'] - PRIORITY_RANK[b.priority ?? 'medium'];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
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
  const maxDailyVisitors = Math.max(
    1,
    ...(state.phase === 'ready' && state.visitorStats
      ? state.visitorStats.dailyLast7.map((d) => d.visitors)
      : [1]),
  );

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} />

      {state.phase === 'auth-required' && firebaseEnabled && !loading && !user && <AuthModal />}

      {/*
        max-w-5xl was 1024px, so on a 1824px screen roughly 800px — nearly half the window — went
        to empty margin while the panels inside were squeezed. This matches the width the journal
        and the marketing pages already use, and the grids below were already written with lg:
        breakpoints they never had room to reach.
      */}
      <main className="relative z-10 flex-1 max-w-[1680px] mx-auto px-4 md:px-6 py-8 md:py-12 w-full">
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

            {/* One header bar: who you are, what build is live, and the utilities. Export used to
                be a panel of its own, competing for attention with the data it exports. */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
                <p className="text-text-secondary text-xs mt-0.5 truncate">
                  {user?.email}
                  {username ? ` (@${username})` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Which bundle is actually running. Makes "I deployed but nothing changed"
                    a one-glance check instead of a guess. */}
                <span
                  className="text-[11px] text-text-secondary/70 tabular-nums mr-1"
                  title={`Bundle built ${BUILD_TIME} from commit ${BUILD_SHA}`}
                >
                  Build {formatBuildStamp()}
                </span>
                <ExportMenu
                  onUsers={() => exportUsersCsv(ready.users, ready.userNotes)}
                  onBugs={() => exportBugReportsCsv(ready.reports)}
                  onBrokers={() => exportBrokerRequestsCsv(ready.brokerRequests)}
                />
                <button
                  type="button"
                  onClick={() => void loadAdmin()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-emerald-400/40 transition-colors focus-ring"
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
              </div>
            </div>

            <NeedsAttention
              openBugs={openBugCount}
              openBrokers={openBrokerCount}
              health={ready.health}
              onGoToRequests={() => setTab('requests')}
            />

            <AdminTabBar
              tab={tab}
              onChange={setTab}
              openCount={openCount}
              userCount={ready.users.length}
            />


            {tab === 'overview' && (
              <>

              {ready.health && (
                <div className="glass-card rounded-xl p-4 md:p-5 mb-6">
                  <div className="flex items-center gap-1.5 mb-3">
                    <History size={13} className="text-text-secondary" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      System health
                    </p>
                  </div>
                  {/* Each service gets its own bounded cell. In a bare 3-column grid the ml-auto
                      status text drifted to the far edge of its column and ended up sitting
                      against the NEXT service's name — so "Down" read as belonging to whatever
                      came after it. */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                    <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary/30 border border-border/40 px-3 py-2">
                      <HealthDot ok={ready.health.brokerSync.ok && Boolean(ready.health.brokerSync.configured)} />
                      <span>Broker sync</span>
                      <span className="text-text-secondary text-xs ml-auto">
                        {ready.health.brokerSync.ok
                          ? ready.health.brokerSync.configured
                            ? 'Ready'
                            : 'No API keys'
                          : 'Down'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary/30 border border-border/40 px-3 py-2">
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
                    <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary/30 border border-border/40 px-3 py-2">
                      <HealthDot ok={ready.health.firebase.ok} />
                      <span>Firebase</span>
                      <span className="text-text-secondary text-xs ml-auto">
                        {ready.health.firebase.ok ? 'Connected' : 'Error'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary/30 border border-border/40 px-3 py-2">
                      <HealthDot ok={ready.health.payments.ok} />
                      <span>Payments</span>
                      <span className="text-text-secondary text-xs ml-auto">
                        {ready.health.payments.error
                          ? 'Down'
                          : ready.health.payments.ok
                            ? ready.health.payments.testMode
                              ? 'Test mode'
                              : 'Ready'
                            : ready.health.payments.checkoutReady
                              ? 'No webhook'
                              : 'Not set up'}
                      </span>
                    </div>
                  </div>

                  {/* Which host the key is being sent to. A present key says nothing about the
                      environment it belongs to, and the mismatch between those two is the only
                      thing that makes a correctly-copied key come back "Invalid API Key" — so it's
                      worth stating outright rather than leaving to be inferred from a 401. */}
                  {ready.health.payments.baseUrl && (
                    <p className="mt-3 text-xs text-text-secondary">
                      Calling{' '}
                      <span className="font-mono text-text-primary">
                        {ready.health.payments.baseUrl}
                      </span>{' '}
                      in {ready.health.payments.testMode ? 'test' : 'live'} mode. The API key and
                      all three product ids must come from that same Creem environment.
                    </p>
                  )}

                  {ready.health.payments.modeMismatch && (
                    <div className="mt-3 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2.5 text-xs leading-relaxed text-loss-bright">
                      Your key looks like a test key but CREEM_TEST_MODE is set to false, so it is
                      being sent to the live host and will always be rejected. Remove that variable
                      or set it to true.
                    </div>
                  )}

                  {/* Named, not just flagged. "Payments: not set up" sends you hunting; the list of
                      variables the server can't see tells you exactly what to paste into Netlify.
                      Names only — no values, no lengths, nothing derived from a key. */}
                  {ready.health.payments.missing.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2.5 text-xs leading-relaxed">
                      <p className="text-amber-300 font-medium mb-1">
                        {ready.health.payments.missing.length} payment variable
                        {ready.health.payments.missing.length === 1 ? '' : 's'} missing in Netlify
                      </p>
                      <p className="text-text-secondary font-mono break-all">
                        {ready.health.payments.missing.join('  ·  ')}
                      </p>
                      <p className="text-text-secondary/80 mt-1.5">
                        Add them under Site configuration → Environment variables, scope Production,
                        then trigger a redeploy — functions only pick up variables at deploy time.
                        {!ready.health.payments.webhookReady &&
                          ready.health.payments.checkoutReady &&
                          ' Checkout works without CREEM_WEBHOOK_SECRET, but nobody gets upgraded after paying.'}
                      </p>
                    </div>
                  )}

                  {ready.healthHistory.length > 1 && (
                    <div className="mt-5 pt-4 border-t border-border/50 grid sm:grid-cols-3 gap-4">
                      <HealthTimeline
                        label="Broker sync"
                        values={ready.healthHistory.map((h) => h.brokerSyncOk)}
                      />
                      <HealthTimeline
                        label="SPY benchmark"
                        values={ready.healthHistory.map((h) => h.benchmarkOk)}
                      />
                      <HealthTimeline
                        label="Firebase"
                        values={ready.healthHistory.map((h) => h.firebaseOk)}
                      />
                    </div>
                  )}
                </div>
              )}

              <AcquisitionFunnel
                visitors={ready.visitorStats}
                serverStats={ready.serverStats}
                fallbackSignups={ready.userCount}
                visitorError={ready.visitorStatsError}
                serverError={ready.serverStatsError}
              />

              <div className="grid xl:grid-cols-2 gap-4 mb-8">
                <SignupTrendPanel
                  serverStats={ready.serverStats}
                  serverError={ready.serverStatsError}
                />
                <BrokerAdoptionPanel
                  serverStats={ready.serverStats}
                  serverError={ready.serverStatsError}
                />
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="glass-card rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                      <Eye size={18} />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Visitors (7 days)
                    </p>
                  </div>
                  <p className="text-3xl font-bold tracking-tight">
                    {ready.visitorStats.last7DaysVisitors.toLocaleString()}
                  </p>
                  <p className="text-xs text-text-secondary mt-2">
                    {ready.visitorStats.totalUniqueVisitors.toLocaleString()} all time
                  </p>
                  {ready.visitorStats.dailyLast7.some((d) => d.visitors > 0) ? (
                    <div className="mt-4 flex items-end gap-1 h-12">
                      {ready.visitorStats.dailyLast7.map((day) => (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-cyan-500/40 rounded-sm min-h-[2px]"
                            style={{ height: `${(day.visitors / maxDailyVisitors) * 100}%` }}
                            title={`${day.visitors} visitor${day.visitors === 1 ? '' : 's'}`}
                          />
                          <span className="text-[9px] text-text-secondary">{day.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-text-secondary mt-3">
                      No visits recorded yet this week.
                    </p>
                  )}
                </div>

                <div className="glass-card rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Users size={18} />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Journals in use
                    </p>
                  </div>
                  <p className="text-3xl font-bold tracking-tight">{usersWithTrades.toLocaleString()}</p>
                  <p className="text-xs text-text-secondary mt-2">
                    of {ready.userCount.toLocaleString()} profiles have trades
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

              {platformStats && (
                <div className="glass-card rounded-xl p-5 md:p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={16} className="text-emerald-400" />
                    <div>
                      <h2 className="text-sm font-semibold text-text-primary">Journaling activity</h2>
                      <p className="text-[10px] text-text-secondary mt-0.5">
                        Journaled (7d) counts saved trades and session dates in the last week
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {platformStats.totalTrades.toLocaleString()}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">Total trades</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {platformStats.tradesSavedLast7Days.toLocaleString()}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">Trades saved (7d)</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {platformStats.activeLast7Days.toLocaleString()}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">Users logged in (7d)</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {platformStats.journaledLast7Days.toLocaleString()}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">Users journaled (7d)</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {platformStats.activationRate.toFixed(0)}%
                      </p>
                      <p className="text-xs text-text-secondary mt-1">Users with trades</p>
                    </div>
                    <div>
                      <p
                        className={`text-2xl font-bold tracking-tight ${
                          platformStats.combinedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {formatCurrency(platformStats.combinedPnl)}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">Combined P&L</p>
                    </div>
                  </div>
                </div>
              )}

                {/* The site's activity and your own, side by side and named apart. They were
                    two stacked panels called "Recent activity" and "Recent admin activity" —
                    adjacent, near-identical names, entirely different data. */}
                <div className="grid md:grid-cols-2 gap-4 mb-8">
                <div className="glass-card rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity size={16} className="text-emerald-400" />
                    <h2 className="text-sm font-semibold text-text-primary">Site activity</h2>
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
                  <ScrollText size={16} className="text-emerald-400" />
                  <h2 className="text-sm font-semibold text-text-primary">Your recent actions</h2>
                </div>
                {ready.auditLog.length === 0 ? (
                  <p className="text-xs text-text-secondary">
                    No admin actions recorded yet — this fills in as you triage reports, update
                    priorities, and manage accounts.
                  </p>
                ) : (
                  <ul className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {ready.auditLog.map((entry) => (
                      <AuditLogItem key={entry.id} entry={entry} />
                    ))}
                  </ul>
                )}
              </div>
                </div>
              </>
            )}

            {tab === 'users' && (
              <div className="glass-card rounded-xl p-5 md:p-6 mb-8">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-emerald-400" />
                    <h2 className="text-sm font-semibold text-text-primary">
                      Users ({ready.users.length})
                      {brokerDataLoaded && connectedCount > 0 && (
                        <span className="ml-2 font-normal text-text-secondary">
                          · {connectedCount} with a broker
                        </span>
                      )}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* A toggle rather than another dropdown option: "who is connected" is the
                        question this tab gets asked most, and it should be one click away. */}
                    <button
                      type="button"
                      onClick={() => setBrokerOnly((v) => !v)}
                      aria-pressed={brokerOnly}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                        brokerOnly
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                          : 'border-border/60 text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      <Link2 size={13} aria-hidden />
                      Broker connected
                    </button>
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search username, email, UID…"
                        className="input-field text-xs py-1.5 pl-8 pr-3 w-52"
                        aria-label="Search users"
                      />
                    </div>
                    <select
                      value={userSort}
                      onChange={(e) => setUserSort(e.target.value as UserSortKey)}
                      className="input-field text-xs py-1.5 px-2"
                      aria-label="Sort users"
                    >
                      {USER_SORTS.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {visibleUsers.length === 0 ? (
                  <p className="text-xs text-text-secondary">
                    {ready.users.length === 0
                      ? 'No users loaded.'
                      : brokerOnly
                        ? 'Nobody has a brokerage linked yet.'
                        : 'No users match this search.'}
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {visibleUsers.map((entry) => (
                      <li key={entry.uid}>
                        <button
                          type="button"
                          onClick={() => setSelectedUser(entry)}
                          className="w-full text-left rounded-lg border border-border/40 bg-bg-tertiary/40 px-3 py-2.5 text-xs hover:border-emerald-500/30 transition-colors"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-text-primary">
                                {entry.username ? `@${entry.username}` : 'No username'}
                                {entry.coachShareEnabled && (
                                  <span className="ml-2 inline-flex px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 text-[9px] font-medium uppercase tracking-wide">
                                    Coach share
                                  </span>
                                )}
                                {ready.userNotes.get(entry.uid)?.flagged && (
                                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[9px] font-medium uppercase tracking-wide">
                                    <Flag size={9} />
                                    Flagged
                                  </span>
                                )}
                                {/* Names the institution when SnapTrade told us one — "Schwab" is
                                    a more useful answer than "connected". */}
                                {brokerByUid.get(entry.uid)?.connected && (
                                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-medium uppercase tracking-wide">
                                    <Link2 size={9} />
                                    {brokerByUid.get(entry.uid)?.institutions[0] ?? 'Broker'}
                                    {(brokerByUid.get(entry.uid)?.accountCount ?? 0) > 1 && (
                                      <> ·{' '}{brokerByUid.get(entry.uid)?.accountCount}</>
                                    )}
                                  </span>
                                )}
                                {/* Started the flow and never finished it — worth seeing, since
                                    that is someone who tried to connect and could not. */}
                                {brokerByUid.has(entry.uid)
                                  && !brokerByUid.get(entry.uid)?.connected && (
                                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-medium uppercase tracking-wide">
                                      <Link2 size={9} />
                                      Started, not linked
                                    </span>
                                  )}
                              </p>
                              <p className="text-text-secondary mt-0.5 truncate">
                                {entry.email || 'Email not stored'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-semibold text-text-primary">
                                {entry.tradeCount > 0 ? `${entry.tradeCount} trades` : 'No trades'}
                              </p>
                              {entry.totalPnl != null && entry.tradeCount > 0 && (
                                <p
                                  className={`mt-0.5 font-medium ${
                                    entry.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}
                                >
                                  {formatCurrency(entry.totalPnl)}
                                  {entry.winRate != null && (
                                    <span className="text-text-secondary font-normal">
                                      {' '}· {entry.winRate.toFixed(0)}% win
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-text-secondary mt-1.5">
                            {[
                              entry.lastTradeActivityAt &&
                                `last journaled ${formatDate(entry.lastTradeActivityAt)}`,
                              entry.lastTradeDate && `last session ${formatDate(entry.lastTradeDate)}`,
                              entry.lastLoginAt && `last login ${formatDate(entry.lastLoginAt)}`,
                              entry.createdAt && `joined ${formatDate(entry.createdAt)}`,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No activity recorded'}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'requests' && (
              <>
              <h2 className="text-base font-semibold mb-2">Broker support requests</h2>
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
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(request.status)}`}
                            >
                              {STATUS_LABELS[request.status]}
                            </span>
                            <PrioritySelect
                              value={request.priority ?? 'medium'}
                              disabled={updatingKey === `broker-priority:${request.id}`}
                              onChange={(priority) =>
                                void handleBrokerPriorityChange(request.id, priority, request.brokerName)
                              }
                            />
                          </div>
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
                            void handleBrokerStatusChange(
                              request.id,
                              e.target.value as BrokerSupportStatus,
                              request.brokerName,
                            )
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
                        onSave={(note) => handleBrokerNoteSave(request.id, note, request.brokerName)}
                        label="Broker request admin note"
                      />
                    </article>
                  ))}
                </div>
              )}


              <h2 className="text-base font-semibold mb-2">Bug reports</h2>
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
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(report.status)}`}
                            >
                              {STATUS_LABELS[report.status]}
                            </span>
                            <PrioritySelect
                              value={report.priority ?? 'medium'}
                              disabled={updatingKey === `bug-priority:${report.id}`}
                              onChange={(priority) =>
                                void handleBugPriorityChange(report.id, priority, report.description.slice(0, 40))
                              }
                            />
                          </div>
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
                            void handleBugStatusChange(
                              report.id,
                              e.target.value as BugReportStatus,
                              report.description.slice(0, 40),
                            )
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
                        onSave={(note) => handleBugNoteSave(report.id, note, report.description.slice(0, 40))}
                        label="Bug report admin note"
                      />
                    </article>
                  ))}
                </div>
              )}
              </>
            )}

            {tab === 'content' && (
              <>
              <AdminCheckoutCard
                onAudit={(detail) =>
                  void logAdminAction({
                    ...adminIdentity,
                    action: 'checkout.toggled',
                    targetType: 'checkout',
                    targetId: 'site',
                    targetLabel: 'Plan checkout',
                    detail,
                  })
                }
              />
              <AdminAnnouncementCard
                onAudit={(detail) =>
                  void logAdminAction({
                    ...adminIdentity,
                    action: 'announcement.published',
                    targetType: 'announcement',
                    targetId: 'site',
                    targetLabel: 'Site announcement',
                    detail,
                  })
                }
              />
              <div className="glass-card rounded-xl p-5 md:p-6 mb-8">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <LifeBuoy size={16} className="text-emerald-400" />
                    <h2 className="text-sm font-semibold text-text-primary">Help Center articles</h2>
                  </div>
                  {missingStarterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleAddStarterArticles()}
                      disabled={articleBusy !== null}
                      className="btn-secondary text-xs px-3 py-1.5 mr-2 disabled:opacity-50"
                      title="Adds articles we've written for you, as drafts"
                    >
                      {articleBusy === 'starter'
                        ? 'Adding…'
                        : `Add ${missingStarterCount} written article${missingStarterCount === 1 ? '' : 's'}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setArticleModal('new')}
                    className="btn-secondary text-xs px-3 py-2 inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    New article
                  </button>
                </div>

                {helpArticles.length === 0 ? (
                  <p className="text-xs text-text-secondary">
                    No articles yet — the public Help Center stays empty until you add one.
                  </p>
                ) : (
                  /* Grouped by category so what's filed where is visible at a glance — the whole
                     point of having categories, and previously only inferable by reading each row. */
                  <div className="space-y-4">
                    {HELP_CATEGORIES.filter((c) =>
                      helpArticles.some((a) => a.category === c.key),
                    ).map((cat) => (
                      <div key={cat.key}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
                          {helpCategoryLabel(cat.key)}
                          <span className="ml-1.5 text-text-secondary/60">
                            {helpArticles.filter((a) => a.category === cat.key).length}
                          </span>
                        </p>
                        <ul className="space-y-2">
                    {helpArticles.filter((a) => a.category === cat.key).map((article) => (
                      <li
                        key={article.id}
                        className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-text-primary truncate">{article.title}</p>
                            {!article.published && (
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-zinc-500/15 text-zinc-400">
                                Draft
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {/* Editable in place: category is the field you change in bulk. */}
                            <select
                              value={article.category}
                              disabled={articleBusy !== null}
                              onChange={(e) =>
                                void handleArticleCategoryChange(
                                  article,
                                  e.target.value as HelpArticleCategory,
                                )
                              }
                              aria-label={`Category for ${article.title}`}
                              className="rounded border border-border/60 bg-bg-tertiary/50 px-1.5 py-0.5 text-[11px] text-text-primary focus-ring disabled:opacity-50"
                            >
                              {HELP_CATEGORIES.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            <span className="text-xs text-text-secondary truncate">
                              Updated {formatDateTime(article.updatedAt)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setArticleModal(article)}
                          className="btn-secondary text-xs px-3 py-1.5 shrink-0"
                        >
                          Edit
                        </button>
                      </li>
                    ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
            )}
          </>
        )}
      </main>

      {selectedUser && user && (
        <AdminUserDetailModal
          user={selectedUser}
          adminUid={user.uid}
          adminEmail={user.email ?? ''}
          note={
            ready?.userNotes.get(selectedUser.uid) ?? {
              note: '',
              flagged: false,
              updatedAt: null,
              updatedBy: null,
            }
          }
          onNoteSave={(patch) => handleUserNoteSave(selectedUser.uid, patch, selectedUser.username ?? selectedUser.email)}
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

      {articleModal !== null && user && (
        <AdminHelpArticleModal
          article={articleModal === 'new' ? null : articleModal}
          adminUid={user.uid}
          adminEmail={user.email ?? ''}
          onClose={() => setArticleModal(null)}
          onSaved={(saved) => {
            setHelpArticles((prev) => {
              const exists = prev.some((a) => a.id === saved.id);
              return exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...prev];
            });
          }}
          onDeleted={(id) => {
            setHelpArticles((prev) => prev.filter((a) => a.id !== id));
          }}
        />
      )}

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}