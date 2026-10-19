import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  BarChart3,
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
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../context/useAuth';
import type { ExtraNavRoute } from '../hooks/useRoute';
import {
  buildActivityFeed,
  claimOrVerifyAdmin,
  computePlatformStats,
  computeSignupStats,
  fetchSignedUpUsers,
  type AdminAccessResult,
  type AdminActivityItem,
  type AdminUserSummary,
} from '../services/admin';
import { formatCurrency } from '../utils/format';
import { adminActionFailureMessage, describeAdminActionError, withTimeout } from '../utils/adminActionError';
import { exportBugReportsCsv, exportUsersCsv } from '../services/adminExport';
import {
  fetchAdminHealth,
  fetchAdminHealthHistory,
  recordAdminHealthSnapshot,
  type AdminHealthSnapshot,
  type AdminHealthStatus,
} from '../services/adminHealth';
import { fetchAllAdminUserNotes, saveAdminUserNote, type AdminUserNote } from '../services/adminUserNotes';
import { AUDIT_ACTION_LABELS, fetchRecentAuditLog, logAdminAction, type AdminAuditEntry } from '../services/adminAuditLog';
import {
  fetchAllTickets,
  updateTicketStatus,
  type SupportTicket,
  type TicketStatus,
} from '../services/supportTickets';
import {
  fetchErrorEvents,
  fetchErrorsDroppedToday,
  updateErrorEventStatus,
  type ErrorEvent,
  type ErrorStatus,
} from '../services/errorEvents';
import { SupportTicketsPanel } from '../components/admin/SupportTicketsPanel';
import { ErrorEventsPanel } from '../components/admin/ErrorEventsPanel';
import { CostsPanel } from '../components/admin/CostsPanel';
import { AdminTabBar } from '../components/admin/AdminTabBar';
import { MoneyAtRiskPanel } from '../components/admin/MoneyAtRiskPanel';
import { MrrMovementPanel } from '../components/admin/MrrMovementPanel';
import { TrialFunnelPanel } from '../components/admin/TrialFunnelPanel';
import { DormantSubscribersPanel } from '../components/admin/DormantSubscribersPanel';
import { AdminAuditPanel } from '../components/admin/AdminAuditPanel';
import { dormantSubscribers, moneyAtRisk, trialStats } from '../utils/adminRisk';
import { ADMIN_TABS, type AdminTab } from '../components/admin/adminTabs';
import { PNL_FLOOR, publishedFigure, TRADERS_FLOOR, TRADES_FLOOR } from '../utils/publicFigures';
import { BrokerStatusPanel } from '../components/admin/BrokerStatusPanel';
import { fetchCostReport, type CostReport } from '../services/adminCosts';
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
import { useBackDestination } from '../hooks/useBackDestination';
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
  FUNNEL_WINDOW_DAYS,
} from '../services/visitorAnalytics';
import {
  fetchAdminServerStats,
  type AdminBrokerUser,
  type AdminServerStats,
} from '../services/adminStats';
import {
  effectiveTierOf,
  fetchAllEntitlements,
  type AdminEntitlementView,
} from '../services/adminEntitlements';
import { TIER_PLANS, type Tier } from '../config/tiers';
import { JobRunsPanel } from '../components/admin/JobRunsPanel';
import { SyncFeedPanel } from '../components/admin/SyncFeedPanel';
import { BillingEventsPanel } from '../components/admin/BillingEventsPanel';
import { EmailLogPanel } from '../components/admin/EmailLogPanel';
import { fetchAdminOps, replayBillingEvent, type AdminOpsResult } from '../services/adminOps';
import { matchesPlanFilter, PLAN_FILTERS, type PlanFilter } from '../utils/adminUserFilters';
import { jobState } from '../utils/jobSchedule';

/**
 * One colour per paid plan, so the ladder is legible at a glance rather than read word by word.
 *
 * Deliberately the same family as the plan cards on the pricing page — somebody who has stared at
 * those knows which is which without the label.
 */
const PLAN_BADGE: Record<Exclude<Tier, 'free'>, string> = {
  silver: 'bg-slate-400/15 text-slate-300',
  gold: 'bg-amber-400/15 text-amber-300',
  diamond: 'bg-accent/15 text-accent',
};

interface AdminPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

type StatusFilter = 'all' | BugReportStatus;

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
  /**
   * 'access' is the admin check itself. 'data' is everything after it — the check has already
   * passed, and saying "Checking access" through a slow read was the panel describing the wrong
   * step, which reads as being locked out rather than as waiting.
   */
  | { phase: 'loading'; step: 'access' | 'data' }
  | { phase: 'unavailable' }
  | { phase: 'auth-required' }
  | { phase: 'denied' }
  | {
      phase: 'ready';
      /**
       * The panel renders once the Firestore reads land. Everything that leaves the browser for a
       * Netlify function — health, server stats, the cost report — arrives after, because a cold
       * function start should not decide when an admin gets to see their bug reports.
       */
      extras: 'loading' | 'ready';
      /** The acquisition funnel's own two calls, so it never waits on the health check's third parties. */
      funnel: 'loading' | 'ready';
      isNewClaim: boolean;
      reports: BugReport[];
      tickets: SupportTicket[];
      errorEvents: ErrorEvent[];
      errorsDropped: number;
      costs: CostReport | null;
      costsError: string | null;
      userCount: number;
      users: AdminUserSummary[];
      health: AdminHealthStatus | null;
      visitorStats: VisitorStats;
      visitorStatsError: string | null;
      serverStats: AdminServerStats | null;
      serverStatsError: string | null;
      userNotes: Map<string, AdminUserNote>;
      /** Plans by uid. Null until loaded — an empty map would render every row as Free. */
      entitlements: Map<string, AdminEntitlementView> | null;
      auditLog: AdminAuditEntry[];
      healthHistory: AdminHealthSnapshot[];
      /** The Ops tab's records. Null while loading; a result with an error when the read failed. */
      ops: AdminOpsResult | null;
    };

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
      return 'bg-accent/15 text-accent';
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
      /*
       * 16px on a phone, 10px from md up.
       *
       * index.css forces 16px on select.input-field below 768px because iOS Safari zooms the page in
       * on any control under 16px and never zooms back out. This is a raw select, so that rule never
       * reached it — and it is the priority control, which is routine triage. The `input-field` class
       * itself is not an option here: it would flatten the pill, and the pill's colour is the thing
       * being read. py-1.5 takes the target from roughly 18px to something a thumb can hit.
       */
      className={`text-[16px] md:text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-1.5 md:py-0.5 border-0 cursor-pointer ${priorityBadgeClass(value)}`}
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
            className={`h-4 flex-1 rounded-[2px] ${ok ? 'bg-accent/70' : 'bg-red-400/80'}`}
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
      className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-accent' : 'bg-red-400'}`}
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
  const [savedValue, setSavedValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * Re-seed the box when the saved note changes underneath it.
   *
   * Adjusted during render rather than from an effect — React's documented way to reset state when
   * a prop changes, and it avoids the extra render pass an effect costs. It also fixes a real edge:
   * the effect version ran after paint, so for one frame the field showed the previous note.
   */
  if (savedValue !== value) {
    setSavedValue(value);
    setDraft(value);
  }

  const save = async () => {
    if (draft.trim() === value.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
    } catch (error) {
      // This runs from onBlur, so a rejection here would have no caller to land in.
      setSaveError(adminActionFailureMessage('Saving the note', error));
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
      {saveError && <p className="text-[10px] text-rose-300 mt-1">{saveError}</p>}
    </div>
  );
}

function ActivityFeedItem({ item }: { item: AdminActivityItem }) {
  const time = formatDateTime(item.at);

  if (item.type === 'signup') {
    return (
      <li className="flex gap-3 text-xs">
        <span className="shrink-0 w-16 text-text-secondary">{time.split(',')[0]}</span>
        <span className="text-accent font-medium">Signup</span>
        <span className="text-text-secondary truncate">
          {item.username ? `@${item.username}` : item.email || item.uid.slice(0, 8)}
        </span>
      </li>
    );
  }

  return (
    <li className="flex gap-3 text-xs">
      <span className="shrink-0 w-16 text-text-secondary">{time.split(',')[0]}</span>
      <span className="text-amber-400 font-medium">Bug</span>
      <span className="text-text-secondary truncate">{item.preview}</span>
    </li>
  );
}


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
              ? 'bg-accent/20 text-accent'
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

/**
 * Splits the panel into four views instead of one continuous scroll.
 *
 * A dozen panels here serve three unrelated jobs — is the site healthy, how is it growing, and
 * what needs me. Stacked in one column they read as a single undifferentiated list, and the two
 * sections with actual work in them sat at the very bottom, furthest from where you land.
 * Grouping by job is most of the fix; the badge does the rest, making "something needs you"
 * visible from every tab instead of only after scrolling to it.
 */
/**
 * The one strip that answers "is there anything I have to do right now".
 *
 * Renders nothing when everything is fine, deliberately. A banner that is always present stops
 * being read; one that appears only when it has something to say keeps its meaning.
 */
function NeedsAttention({
  openBugs,
  ticketsWaiting,
  openErrors,
  health,
  onGoToRequests,
  onGoToSupport,
  onGoToErrors,
}: {
  openBugs: number;
  ticketsWaiting: number;
  openErrors: number;
  health: AdminHealthStatus | null;
  onGoToRequests: () => void;
  onGoToSupport: () => void;
  onGoToErrors: () => void;
}) {
  const down: string[] = [];
  if (health) {
    if (!health.brokerSync.ok) down.push('Broker sync');
    if (!health.benchmark.ok) down.push('SPY benchmark');
    if (!health.firebase.ok) down.push('Firebase');
    // A paused checkout is the owner's own doing and belongs nowhere near an outage banner.
    if (!health.payments.ok) down.push('Payments');
  }

  const waiting: string[] = [];
  // Tickets first: a person is on the other end of one, and unlike a bug report they are waiting
  // for a reply rather than for a fix.
  if (ticketsWaiting > 0) {
    waiting.push(`${ticketsWaiting} support ticket${ticketsWaiting === 1 ? '' : 's'}`);
  }
  if (openErrors > 0) waiting.push(`${openErrors} production error${openErrors === 1 ? '' : 's'}`);
  if (openBugs > 0) waiting.push(`${openBugs} open bug report${openBugs === 1 ? '' : 's'}`);

  if (waiting.length === 0 && down.length === 0) return null;

  // An unanswered ticket or an active crash is escalated to the red treatment: both mean someone
  // is currently having a bad time in the product.
  const critical = down.length > 0 || openErrors > 0 || ticketsWaiting > 0;

  // Whichever queue is loudest is where "Review" should land.
  const review = ticketsWaiting > 0 ? onGoToSupport : openErrors > 0 ? onGoToErrors : onGoToRequests;

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
          onClick={review}
          className="text-xs font-medium text-accent hover:text-accent transition-colors focus-ring rounded shrink-0"
        >
          Review &rarr;
        </button>
      )}
    </div>
  );
}

/** CSV exports collapsed into one control. They were a full panel competing with real data. */
/** One of the proof strip's figures: the raw count, and what the public sees (or why nothing yet). */
function ProofFigure({
  label,
  raw,
  floor,
  prefix = '',
}: {
  label: string;
  raw: number | null;
  floor: number;
  /** "$" for the P&L figure, so the raw and published values read as money. */
  prefix?: string;
}) {
  const shown = publishedFigure(raw, floor);
  // A signed figure keeps its sign in front of the prefix: -$1,200, not $-1,200.
  const money = (n: number) => `${n < 0 ? '-' : ''}${prefix}${Math.abs(Math.round(n)).toLocaleString()}`;
  return (
    <div className="mt-2 first:mt-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`text-xl font-bold tracking-tight tabular-nums ${raw !== null && raw < 0 ? 'text-loss-bright' : ''}`}>
        {raw === null ? '—' : money(raw)}
        <span className="ml-2 text-xs font-medium text-text-secondary">
          {raw === null
            ? 'not counted'
            : shown !== null
              ? `shows as ${money(shown)}+`
              : `hidden until ${money(floor)}`}
        </span>
      </p>
    </div>
  );
}

function ExportMenu({
  onUsers,
  onBugs,
}: {
  onUsers: () => void;
  onBugs: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEscapeToClose(() => setOpen(false));

  const items = [
    { label: 'Users CSV', run: onUsers },
    { label: 'Bug reports CSV', run: onBugs },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors focus-ring"
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

// Only onHome is read: the marketing nav and footer that took the rest are gone from this page —
// an admin panel is a tool, not a page on the site, and it is framed like one now.
export function AdminPage({ onHome }: AdminPageProps) {
  const { user, username, loading, firebaseEnabled, logout } = useAuth();
  const [state, setState] = useState<AdminState>({ phase: 'loading', step: 'access' });
  const [tab, setTab] = useState<AdminTab>('overview');
  /* One clock for every derivation on the page. Read once rather than per render: react-hooks/purity
     forbids Date.now() during render, and two panels disagreeing about "today" by a few ms would
     round a deadline differently on each. */
  const [now] = useState(() => Date.now());
  /** Busy state for a silent refresh, which leaves the panel on screen rather than replacing it. */
  const [refreshing, setRefreshing] = useState(false);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  /** The last admin mutation that failed, named. Cleared when the next one starts. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [bugFilter, setBugFilter] = useState<StatusFilter>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [userSearch, setUserSearch] = useState('');
  /** Narrows the list to people who actually have a brokerage linked. */
  const [brokerOnly, setBrokerOnly] = useState(false);
  const [userSort, setUserSort] = useState<UserSortKey>('activity');
  const [helpArticles, setHelpArticles] = useState<HelpArticle[]>([]);
  const [articleBusy, setArticleBusy] = useState<string | null>(null);
  const [articleModal, setArticleModal] = useState<'new' | HelpArticle | null>(null);

  /**
   * Which load is current. A refresh started while the previous run's slow half is still in flight
   * would otherwise let the older answer overwrite the newer one.
   */
  const back = useBackDestination(onHome);

  const loadToken = useRef(0);

  /*
   * A silent load keeps what is already on screen while the data is refetched.
   *
   * Refresh used to drop the whole panel to a single line of text — every tab, count and banner
   * gone — and the first copy it showed was "Checking access…", which reads as being locked out
   * rather than as waiting. The AdminState comment above already says that about this exact string.
   * Keeping the stale data visible costs nothing: the first wave replaces the whole state object
   * when it lands anyway, and a denial still takes over the screen from inside a silent run.
   */
  const loadAdmin = useCallback(async (silent = false) => {
    const token = ++loadToken.current;
    const isCurrent = () => loadToken.current === token;

    if (!firebaseEnabled) {
      setState({ phase: 'unavailable' });
      return;
    }

    if (loading) {
      setState({ phase: 'loading', step: 'access' });
      return;
    }

    if (!user) {
      setState({ phase: 'auth-required' });
      return;
    }

    if (!silent) setState({ phase: 'loading', step: 'access' });

    let access: AdminAccessResult;
    try {
      access = await claimOrVerifyAdmin(user.uid, user.email ?? '', username);
    } catch {
      setState({ phase: 'denied' });
      return;
    }

    if (!isCurrent()) return;

    if (!access.ok) {
      setState({ phase: access.reason === 'not-configured' ? 'unavailable' : 'denied' });
      return;
    }

    if (!silent) setState({ phase: 'loading', step: 'data' });

    try {
      // First wave: the reads the panel is made of. All of these are Firestore, and none of them
      // wakes a Netlify function.
      const [
        reportsResult,
        usersResult,
        notesResult,
        auditResult,
        ticketsResult,
        errorsResult,
      ] = await Promise.allSettled([
        fetchBugReports(),
        fetchSignedUpUsers(),
        fetchAllAdminUserNotes(),
        fetchRecentAuditLog(),
        fetchAllTickets(),
        fetchErrorEvents(),
      ]);

      if (!isCurrent()) return;

      const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
      const signupStats = computeSignupStats(users);

      setState({
        phase: 'ready',
        extras: 'loading',
        funnel: 'loading',
        isNewClaim: access.isNewClaim,
        reports: reportsResult.status === 'fulfilled' ? reportsResult.value : [],
        tickets: ticketsResult.status === 'fulfilled' ? ticketsResult.value : [],
        errorEvents: errorsResult.status === 'fulfilled' ? errorsResult.value : [],
        errorsDropped: 0,
        costs: null,
        costsError: null,
        userCount: users.length,
        users,
        health: null,
        visitorStats: emptyVisitorStats(signupStats.last7Days),
        visitorStatsError: null,
        serverStats: null,
        serverStatsError: null,
        userNotes: notesResult.status === 'fulfilled' ? notesResult.value : new Map(),
        entitlements: null,
        auditLog: auditResult.status === 'fulfilled' ? auditResult.value : [],
        healthHistory: [],
        ops: null,
      });

      /*
       * Second wave: the slow half, in two groups that finish independently.
       *
       * This used to be one Promise.allSettled over all six with a single `extras` flag flipped at
       * the end — so the acquisition funnel, which needs two of them, waited for the slowest of
       * six. One of those six is the health check, and that is not one request either: it fans out
       * to SnapTrade, a market-data endpoint and Creem. The funnel sat at "Counting visitors…"
       * behind third parties it has nothing to do with, for up to the 15s withTimeout ceiling.
       *
       * Grouped by the card that consumes them instead. Each group paints when its own data lands,
       * and a third party having a slow morning now delays only the card that asked about it.
       */
      const funnelDone = Promise.allSettled([
        withTimeout(fetchVisitorStats(signupStats.last7Days), 'visitor stats'),
        withTimeout(fetchAdminServerStats(), 'server stats'),
        withTimeout(fetchAllEntitlements(), 'plans'),
      ]).then(([visitorResult, serverResult, entitlementsResult]) => {
        if (!isCurrent()) return;
        setState((prev) => {
          if (prev.phase !== 'ready') return prev;
          return {
            ...prev,
            funnel: 'ready',
            visitorStats:
              visitorResult.status === 'fulfilled'
                ? visitorResult.value.stats
                : emptyVisitorStats(signupStats.last7Days),
            visitorStatsError:
              visitorResult.status === 'fulfilled'
                ? visitorResult.value.error
                : describeAdminActionError(visitorResult.reason),
            entitlements:
              entitlementsResult.status === 'fulfilled' ? entitlementsResult.value : new Map(),
            serverStats: serverResult.status === 'fulfilled' ? serverResult.value.stats : null,
            serverStatsError:
              serverResult.status === 'fulfilled'
                ? serverResult.value.error
                : describeAdminActionError(serverResult.reason),
          };
        });
      });

      const rest = Promise.allSettled([
        withTimeout(fetchAdminHealth(), 'health check'),
        withTimeout(fetchAdminHealthHistory(), 'health history'),
        withTimeout(fetchErrorsDroppedToday(), 'dropped-error count'),
        withTimeout(fetchCostReport(), 'cost report'),
      ]).then(([healthResult, healthHistoryResult, droppedResult, costsResult]) => {
        if (!isCurrent()) return;

        const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
        if (health) void recordAdminHealthSnapshot(health);

        setState((prev) => {
          if (prev.phase !== 'ready') return prev;
          return {
            ...prev,
            extras: 'ready',
            health,
            healthHistory: healthHistoryResult.status === 'fulfilled' ? healthHistoryResult.value : [],
            errorsDropped: droppedResult.status === 'fulfilled' ? droppedResult.value : 0,
            costs: costsResult.status === 'fulfilled' ? costsResult.value.report : null,
            costsError:
              costsResult.status === 'fulfilled'
                ? costsResult.value.error
                : describeAdminActionError(costsResult.reason),
          };
        });
      });

      // The Ops records: four Firestore reads behind one function, its own group so a slow one
      // delays the Ops tab and nothing else.
      const opsDone = withTimeout(fetchAdminOps(), 'ops records')
        .catch((err: unknown): AdminOpsResult => ({ report: null, error: describeAdminActionError(err) }))
        .then((ops) => {
          if (!isCurrent()) return;
          setState((prev) => (prev.phase !== 'ready' ? prev : { ...prev, ops }));
        });

      // Awaited only so the catch below still covers every group; no card waits on another.
      await Promise.allSettled([funnelDone, rest, opsDone]);
    } catch {
      if (!isCurrent()) return;
      setState({
        phase: 'ready',
        extras: 'ready',
        funnel: 'ready',
        isNewClaim: access.isNewClaim,
        reports: [],
        tickets: [],
        errorEvents: [],
        errorsDropped: 0,
        costs: null,
        costsError: null,
        userCount: 0,
        users: [],
        health: null,
        visitorStats: emptyVisitorStats(0),
        visitorStatsError: null,
        serverStats: null,
        serverStatsError: null,
        userNotes: new Map(),
        // Loaded-and-empty rather than null: this is the failure path, and there are no users to
        // badge anyway. Null would leave the list waiting for plans that are never coming.
        entitlements: new Map(),
        auditLog: [],
        healthHistory: [],
        ops: { report: null, error: 'The admin panel could not load.' },
      });
    }
  }, [firebaseEnabled, loading, user, username]);

  useEffect(() => {
    // Clearing state before the fetch or subscription below. This is the external-system sync
    // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
    // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
    // rule rather than to fix a bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  /**
   * Every mutation in this panel goes through here.
   *
   * These handlers are all called as `void handleSomething(...)` from an onClick, so a rejection
   * had nowhere to go: it became an unhandled promise rejection, was reported to the error feed as
   * an anonymous permission failure attributed to the page, and left the button looking like it had
   * simply done nothing. Catching here means the panel names the action that failed, in the panel,
   * at the moment it fails.
   */
  const runAdminAction = async <T,>(
    busyKey: string,
    what: string,
    run: () => Promise<T>,
  ): Promise<T | undefined> => {
    setUpdatingKey(busyKey);
    setActionError(null);
    try {
      return await run();
    } catch (error) {
      setActionError(adminActionFailureMessage(what, error));
      return undefined;
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleTicketStatusChange = (ticketId: string, status: TicketStatus, subject: string) =>
    runAdminAction(`ticket:${ticketId}`, 'Updating the ticket', async () => {
      await updateTicketStatus(ticketId, status);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          tickets: prev.tickets.map((t) => (t.id === ticketId ? { ...t, status } : t)),
        };
      });
      void logAdminAction({
        ...adminIdentity,
        action: 'ticket.status-changed',
        targetType: 'support-ticket',
        targetId: ticketId,
        targetLabel: subject,
        detail: `Status \u2192 ${STATUS_LABELS[status]}`,
      });
    });

  /* A reply flips unreadForSupport off in Firestore, but this page holds its tickets in local
     state — without this the "waiting on you" badge would keep counting a ticket you just
     answered until the next refresh. */
  const handleTicketReplied = (ticketId: string) => {
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      return {
        ...prev,
        tickets: prev.tickets.map((t) =>
          t.id === ticketId ? { ...t, unreadForSupport: false, lastMessageFrom: 'support' as const } : t,
        ),
      };
    });
  };

  const handleErrorStatusChange = (errorId: string, status: ErrorStatus) =>
    runAdminAction(`error:${errorId}`, 'Updating the error', async () => {
      await updateErrorEventStatus(errorId, status);
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return {
          ...prev,
          errorEvents: prev.errorEvents.map((e) => (e.id === errorId ? { ...e, status } : e)),
        };
      });
      void logAdminAction({
        ...adminIdentity,
        action: 'error.status-changed',
        targetType: 'error-event',
        targetId: errorId,
        targetLabel: errorId.slice(0, 8),
        detail: `Status \u2192 ${status}`,
      });
    });

  const handleBugStatusChange = (reportId: string, status: BugReportStatus, label: string) =>
    runAdminAction(`bug:${reportId}`, 'Updating the bug report', async () => {
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
    });

  const handleBugPriorityChange = (reportId: string, priority: AdminPriority, label: string) =>
    runAdminAction(`bug-priority:${reportId}`, 'Changing the bug priority', async () => {
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
    });

  const handleBugNoteSave = (reportId: string, adminNote: string, label: string) =>
    runAdminAction(`bug-note:${reportId}`, 'Saving the note', async () => {
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
    });

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
   * Support tickets, error events and the costs breakdown all name a person. Each one used to leave
   * the reader to copy the uid, switch to Users, paste it into the search box and click the row —
   * for the single most common next question in all three panels. The detail modal renders at page
   * level, so opening it from another tab needs nothing but the summary.
   *
   * canOpenUser is the other half: tickets and errors outlive the account that filed them, and a
   * name that cannot be opened stays plain text instead of becoming a button that does nothing.
   */
  const userByUid = useMemo(
    () => new Map((ready?.users ?? []).map((u) => [u.uid, u])),
    [ready?.users],
  );

  const openUserByUid = useCallback(
    (uid: string) => {
      const found = userByUid.get(uid);
      if (found) setSelectedUser(found);
    },
    [userByUid],
  );

  const canOpenUserByUid = useCallback((uid: string) => userByUid.has(uid), [userByUid]);

  /* The Ops tab names people by uid (syncs, webhooks) or by address (emails); both resolve
     through the loaded user list, and an unknown one is shown as it came. */
  const labelForUid = useCallback(
    (uid: string) => {
      const found = userByUid.get(uid);
      return found ? (found.username ? `@${found.username}` : found.email) : `${uid.slice(0, 8)}…`;
    },
    [userByUid],
  );
  const uidByEmail = useMemo(
    () => new Map((ready?.users ?? []).map((u) => [u.email.toLowerCase(), u.uid])),
    [ready?.users],
  );
  const uidForEmail = useCallback((email: string) => uidByEmail.get(email.toLowerCase()) ?? null, [uidByEmail]);

  const reloadOps = useCallback(async () => {
    const ops = await fetchAdminOps();
    setState((prev) => (prev.phase !== 'ready' ? prev : { ...prev, ops }));
  }, []);

  /** Replays a stored Creem event, then re-reads the log so the row shows its new outcome. */
  const handleReplayBillingEvent = useCallback(
    async (eventId: string) => {
      const { message } = await replayBillingEvent(eventId);
      void reloadOps();
      return message;
    },
    [reloadOps],
  );

  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');

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
     rows say nothing rather than claiming nobody is connected.

     serverStats has to EXIST first. With it null — still loading, or the call failed — the old test
     fell through to `brokerRegisteredCount ?? 0`, read 0, decided "SnapTrade has nobody registered,
     so an empty list is genuinely empty", and reported the data as loaded. That is the exact case
     this flag exists to catch, answered the wrong way round. */
  const brokerDataLoaded = ready?.serverStats != null
    && ((ready.serverStats.brokerUsers?.length ?? 0) > 0
      || (ready.serverStats.brokerRegisteredCount ?? 0) === 0);

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
    // Plans are null until loaded; until then the chips are disabled and nothing is filtered out.
    const byPlan =
      planFilter === 'all' || !ready.entitlements
        ? scoped
        : scoped.filter((u) => matchesPlanFilter(planFilter, u, ready.entitlements!.get(u.uid) ?? null, now));
    return sortUsers(byPlan, userSort);
  }, [ready, userSearch, userSort, brokerOnly, brokerByUid, planFilter, now]);

  const connectedCount = useMemo(
    () => (ready?.users ?? []).filter((u) => brokerByUid.get(u.uid)?.connected).length,
    [ready?.users, brokerByUid],
  );

  const activityFeed = useMemo(
    () => (ready ? buildActivityFeed(ready.users, ready.reports) : []),
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

  const bugFilterCounts = useMemo(() => {
    if (!ready) return { all: 0, open: 0, resolved: 0, closed: 0 };
    return {
      all: ready.reports.length,
      open: ready.reports.filter((r) => r.status === 'open').length,
      resolved: ready.reports.filter((r) => r.status === 'resolved').length,
      closed: ready.reports.filter((r) => r.status === 'closed').length,
    };
  }, [ready]);

  const openBugCount = bugFilterCounts.open;
  const openCount = openBugCount;
  /* The funnel measures a rolling year, so signups have to be counted over the same window —
     an all-time signup count beside a 12-month visitor count is two different periods stacked in
     one chart, and it reads as a conversion rate that cannot be true. */
  const annualSignups = useMemo(() => {
    if (!ready) return 0;
    const since = new Date();
    since.setDate(since.getDate() - FUNNEL_WINDOW_DAYS);
    const cutoff = since.toISOString();
    return ready.users.filter((u) => (u.createdAt ?? '') >= cutoff).length;
  }, [ready]);
  const ticketsWaiting = ready?.tickets.filter((t) => t.unreadForSupport && t.status !== 'closed').length ?? 0;
  /* Bug reports from anyone signed in, which arrive as tickets rather than in the bugReports
     collection the Requests tab lists. Counted so that panel can say where they went. */
  const bugTickets = ready?.tickets.filter((t) => t.category === 'bug' && t.status === 'open').length ?? 0;
  const openErrorCount = ready?.errorEvents.filter((e) => e.status === 'open').length ?? 0;

  /*
   * The four derivations that turn the panel from a report into a worklist.
   *
   * All of them read data the page already had — the entitlement map, the user list, the broker
   * map and the cost report. Nothing here adds a request.
   */
  const riskRows = useMemo(
    () =>
      ready?.entitlements
        ? moneyAtRisk(
            ready.users,
            ready.entitlements,
            // Unknown, not false, until the broker stats have actually arrived — otherwise every
            // running trial is listed as "no broker connected" for the first seconds of every visit,
            // and for good if the stats call fails.
            (uid) => (brokerDataLoaded ? Boolean(brokerByUid.get(uid)?.connected) : null),
            now,
          )
        : [],
    // [ready] rather than its parts, like every other memo on this page: narrowing ready?.x inside
    // the callback is something the compiler cannot carry into the dependency list.
    [ready, brokerByUid, brokerDataLoaded, now],
  );

  /*
   * Who has ever actually been charged, from the ledger.
   *
   * Never from the plan: a trialling subscription is status 'active' on a paid tier, exactly like a
   * paying one, so reading conversion off the tier would score every trial as converted on day one.
   */
  const everPaid = useMemo(
    // The whole ledger, computed on the server. This used to be built from `purchases`, the newest
    // fifty charges kept for display — so past fifty, an old conversion read as a lapse.
    () => new Set(ready?.costs?.everPaid ?? []),
    [ready],
  );
  /* Unknown, not "nobody has paid", when the ledger did not load: an empty set would turn every
     finished trial into a lapse and print a confident 0%. */
  const paidKnown = Boolean(ready?.costs?.everPaid);

  const trials = useMemo(
    () => trialStats(ready?.entitlements ?? new Map(), (uid) => everPaid.has(uid), now),
    [ready, everPaid, now],
  );

  // From the server, over the whole ledger, for the same reason as everPaid above.
  const movement = ready?.costs?.movement ?? [];

  const dormant = useMemo(
    () => (ready?.entitlements ? dormantSubscribers(ready.users, ready.entitlements, now) : []),
    [ready, now],
  );

  const usersWithTrades = ready?.users.filter((u) => u.tradeCount > 0).length ?? 0;
  const maxDailySignup = Math.max(1, ...(signupStats?.dailyLast7.map((d) => d.count) ?? [1]));
  const maxDailyVisitors = Math.max(
    1,
    ...(state.phase === 'ready' && state.visitorStats
      ? state.visitorStats.dailyLast7.map((d) => d.visitors)
      : [1]),
  );

  return (
    /*
     * An admin shell, not a marketing page with an admin section in it.
     *
     * This sat under the site's nav bar and above its footer, with a back link, a 36px "Admin" title
     * and an identity row before any number — a web page about the business rather than a tool for
     * running it. It is framed the way every admin tool is now: sections down a rail on the left
     * (the same pill-and-bar nav the journal's sidebar uses), a slim top bar with the section's
     * name and the utilities, and the content full width beside them. On a phone the rail folds
     * into a grid of pills under the top bar, so every section stays one tap away.
     *
     * No backdrop-filter anywhere in the frame: the Export menu's fixed overlay lives inside the
     * top bar, and a blur there would make the bar its containing block — the bug that has bitten
     * this panel twice.
     */
    <div className="min-h-dvh bg-bg-primary text-text-primary flex">
      {state.phase === 'auth-required' && firebaseEnabled && !loading && !user && <AuthModal />}

      <aside className="hidden lg:flex w-60 shrink-0 flex-col sticky top-0 h-dvh border-r border-white/5 bg-bg-secondary">
        <div className="flex h-16 items-center gap-2.5 border-b border-white/5 px-4">
          <BrandLogo size="sm" variant="mark" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">Trend Chasers</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Admin</p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 py-3">
          {ready && (
            <AdminTabBar
              variant="rail"
              tab={tab}
              onChange={setTab}
              openCount={openCount}
              userCount={ready.users.length}
              ticketsWaiting={ticketsWaiting}
              openErrors={openErrorCount}
            />
          )}
        </div>
        <div className="space-y-2 border-t border-white/5 p-3">
          <button
            type="button"
            onClick={back.goBack}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors focus-ring"
          >
            <ArrowLeft size={14} />
            {back.label}
          </button>
          {user && (
            <p className="truncate px-2 text-[11px] text-text-secondary">
              {user.email}
              {username ? ` (@${username})` : ''}
            </p>
          )}
          {/* Which bundle is actually running: makes "I deployed but nothing changed" a glance. */}
          <p className="px-2 text-[10px] tabular-nums text-text-secondary/60" title={`Bundle built ${BUILD_TIME} from commit ${BUILD_SHA}`}>
            Build {formatBuildStamp()}
          </p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/5 bg-bg-primary/95 px-4 md:px-6">
          <button
            type="button"
            onClick={back.goBack}
            aria-label={back.label}
            className="lg:hidden -ml-1 rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors focus-ring"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="lg:hidden">
            <BrandLogo size="sm" variant="mark" />
          </span>
          <div className="min-w-0 flex items-baseline gap-2">
            <h1 className="truncate text-base font-semibold md:text-lg">
              {ready ? ADMIN_TABS.find((t) => t.id === tab)?.label : 'Admin'}
            </h1>
            {ready && <span className="hidden text-xs text-text-secondary sm:inline">Admin</span>}
          </div>
          {ready && (
            <div className="ml-auto flex items-center gap-2">
              <ExportMenu
                onUsers={() => exportUsersCsv(ready.users, ready.userNotes)}
                onBugs={() => exportBugReportsCsv(ready.reports)}
              />
              <button
                type="button"
                disabled={refreshing}
                onClick={() => {
                  // Silent: the panel stays on screen and the icon carries the busy state, rather
                  // than the whole thing being replaced by "Checking access…" for a second.
                  setRefreshing(true);
                  void loadAdmin(true).finally(() => setRefreshing(false));
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-white/20 transition-colors focus-ring disabled:opacity-60"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            </div>
          )}
        </header>

      <main className="relative flex-1 w-full max-w-[1680px] mx-auto px-4 md:px-6 py-4 md:py-6">
        {state.phase === 'loading' && (
          <p className="text-text-secondary">
            {state.step === 'access' ? 'Checking access…' : 'Loading the panel…'}
          </p>
        )}

        {state.phase === 'unavailable' && (
          <div className="panel-card rounded-xl p-6 text-sm text-text-secondary">
            Admin panel is unavailable — Firebase is not configured for this environment.
          </div>
        )}

        {state.phase === 'auth-required' && (
          <div className="panel-card rounded-xl p-6 text-sm text-text-secondary">
            Sign in to access the admin panel. The first account to sign in here becomes the site
            administrator.
          </div>
        )}

        {state.phase === 'denied' && (
          <div className="panel-card rounded-xl p-8 text-center max-w-lg">
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
              <div className="mb-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                You are now the site administrator. This account is the only one that can access this
                panel going forward.
              </div>
            )}

            {/* The phone's nav: the rail is in the side column from lg up. */}
            <div className="lg:hidden">
              <AdminTabBar
                variant="grid"
                tab={tab}
                onChange={setTab}
                openCount={openCount}
                userCount={ready.users.length}
                ticketsWaiting={ticketsWaiting}
                openErrors={openErrorCount}
              />
            </div>

            <NeedsAttention
              openBugs={openBugCount}
              ticketsWaiting={ticketsWaiting}
              openErrors={openErrorCount}
              health={ready.health}
              onGoToRequests={() => setTab('requests')}
              onGoToSupport={() => setTab('support')}
              onGoToErrors={() => setTab('errors')}
            />

            {actionError && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3"
              >
                <AlertTriangle size={15} className="text-rose-300 mt-0.5 shrink-0" />
                <p className="text-sm text-rose-100 flex-1">{actionError}</p>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-xs font-medium text-rose-200/80 hover:text-rose-100 focus-ring rounded px-1"
                >
                  Dismiss
                </button>
              </div>
            )}


            {tab === 'overview' && (
              <>
              {/*
                The worklist, above the charts.

                Everything below this point answers "how is it going"; these two answer "what should
                I do now", and those were the two questions the panel could not answer at all. A
                growth chart is worth less than one declined card nobody knew about.
              */}
              <div className="mb-6 space-y-4">
                <MoneyAtRiskPanel
                  rows={riskRows}
                  onOpenUser={openUserByUid}
                  canOpenUser={canOpenUserByUid}
                />
                <DormantSubscribersPanel
                  rows={dormant}
                  onOpenUser={openUserByUid}
                  canOpenUser={canOpenUserByUid}
                />
              </div>

              {/*
                The card when the check has not answered — not nothing.

                `ready.health` is null both while the request is in flight and when it failed or timed
                out, and this block was its only renderer. So the first seconds of every visit, and
                every failure, looked exactly like a healthy system: Overview jumped from the header
                to the growth charts. NeedsAttention is computed from the same null, so it could not
                raise an outage either — the one screen whose job is "is anything on fire" answered
                "no" by staying silent.
              */}
              {!ready.health && (
                <div className="panel-card rounded-xl p-4 md:p-5 mb-6">
                  <div className="flex items-center gap-1.5 mb-3">
                    <History size={13} className="text-text-secondary" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      System health
                    </p>
                  </div>
                  {ready.extras === 'loading' ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {['api', 'broker', 'payments', 'mail'].map((key) => (
                        <div
                          key={key}
                          className="h-[42px] rounded-lg bg-bg-tertiary/30 border border-border/40 skeleton-shimmer"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-300 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
                      The health check did not answer. This says nothing about whether the services
                      are up — it means we could not ask.
                    </p>
                  )}
                </div>
              )}

              {ready.health && (
                <div className="panel-card rounded-xl p-4 md:p-5 mb-6">
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
                          : ready.health.payments.checkoutEnabled === false
                            ? 'Paused'
                            : ready.health.payments.ok
                              ? ready.health.payments.testMode
                                ? 'Test mode'
                                : 'Ready'
                              : ready.health.payments.checkoutReady
                                ? 'No webhook'
                                : 'Not set up'}
                      </span>
                    </div>
                    {/* The two the Ops records answer: is mail configured, and did every scheduled
                        job run when it should have. Both read "Checking…" until that call lands. */}
                    <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary/30 border border-border/40 px-3 py-2">
                      <HealthDot ok={ready.ops?.report ? ready.ops.report.mailConfigured : true} />
                      <span>Mail</span>
                      <span className="text-text-secondary text-xs ml-auto">
                        {ready.ops?.report ? (ready.ops.report.mailConfigured ? 'Ready' : 'Not set up') : ready.ops ? 'Unknown' : 'Checking…'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary/30 border border-border/40 px-3 py-2">
                      <HealthDot ok={!ready.ops?.report || ready.ops.report.jobs.every((j) => !['late', 'failed'].includes(jobState(j.spec, j.last, now)))} />
                      <span>Scheduled jobs</span>
                      <span className="text-text-secondary text-xs ml-auto">
                        {ready.ops?.report
                          ? (() => {
                              const bad = ready.ops.report.jobs.filter((j) => ['late', 'failed'].includes(jobState(j.spec, j.last, now))).length;
                              const never = ready.ops.report.jobs.filter((j) => jobState(j.spec, j.last, now) === 'never').length;
                              return bad > 0 ? `${bad} late or failed` : never === ready.ops.report.jobs.length ? 'No runs yet' : 'On time';
                            })()
                          : ready.ops
                            ? 'Unknown'
                            : 'Checking…'}
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

                  {/* Yearly plans switch themselves on when these exist, so this line is the
                      whole of their setup: what is missing, by name, and nothing else to flip. */}
                  {ready.health.payments.annualProducts && (
                    <p className="mt-2 text-xs text-text-secondary">
                      Yearly plans:{' '}
                      {ready.health.payments.annualReady ? (
                        <span className="text-accent">on sale</span>
                      ) : (
                        <>
                          off — add{' '}
                          <span className="font-mono text-text-primary break-all">
                            {ready.health.payments.annualProducts
                              .filter((p) => !p.present && p.envName)
                              .map((p) => p.envName)
                              .join(', ') || 'distinct yearly product ids'}
                          </span>{' '}
                          and redeploy to sell them.
                        </>
                      )}
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

              {/*
                Beside the funnel, because it IS the next stage of it.

                AcquisitionFunnel runs Visitors → Opened → Signed up → Connected a broker and stops
                one step short of the only transition that earns anything. It cannot simply gain a
                fifth bar: the funnel measures a rolling year from the visitor counters, and trials
                are only visible from the day the webhook started recording their dates.
              */}
              <div className="grid gap-4 mb-8 xl:grid-cols-[2fr_1fr]">
                <AcquisitionFunnel
                  visitors={ready.visitorStats}
                  serverStats={ready.serverStats}
                  annualSignups={annualSignups}
                  visitorError={ready.visitorStatsError}
                  serverError={ready.serverStatsError}
                  loading={ready.funnel === 'loading'}
                />
                <TrialFunnelPanel
                  stats={trials}
                  loaded={ready.entitlements !== null && ready.extras !== 'loading'}
                  paidKnown={paidKnown}
                />
              </div>

              <div className="grid xl:grid-cols-2 gap-4 mb-8">
                {/* Both read serverStats, which arrives with the funnel's group. */}
                <SignupTrendPanel
                  serverStats={ready.serverStats}
                  serverError={ready.serverStatsError}
                  loading={ready.funnel === 'loading'}
                />
                <BrokerAdoptionPanel
                  serverStats={ready.serverStats}
                  serverError={ready.serverStatsError}
                  loading={ready.funnel === 'loading'}
                />
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div className="panel-card rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-accent/10 text-accent">
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
                    {ready.visitorStats.uniqueVisitors.toLocaleString()} in the last 12 months
                  </p>
                  {ready.visitorStats.dailyLast7.some((d) => d.visitors > 0) ? (
                    <div className="mt-4 flex items-end gap-1 h-12">
                      {ready.visitorStats.dailyLast7.map((day) => (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-accent/40 rounded-sm min-h-[2px]"
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

                <div className="panel-card rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-accent/10 text-accent">
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
                            className="w-full bg-accent/40 rounded-sm min-h-[2px]"
                            style={{ height: `${(day.count / maxDailySignup) * 100}%` }}
                            title={`${day.count} signup${day.count === 1 ? '' : 's'}`}
                          />
                          <span className="text-[9px] text-text-secondary">{day.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/*
                  What the landing page's proof strip is saying, and how close each withheld figure
                  is to showing. The strip publishes only floored, rounded values; this is the raw
                  count beside the rule, so "when will traders show up" has an answer.
                */}
                <div className="panel-card rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-accent/10 text-accent">
                      <BarChart3 size={18} />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Proof strip
                    </p>
                  </div>
                  <ProofFigure
                    label="Combined P&L"
                    raw={ready.serverStats?.journalPnlTotal ?? null}
                    floor={PNL_FLOOR}
                    prefix="$"
                  />
                  <ProofFigure
                    label="Trades journaled (shown while P&L is hidden)"
                    raw={ready.serverStats?.journalTradeCount ?? null}
                    floor={TRADES_FLOOR}
                  />
                  <ProofFigure
                    label="Traders"
                    raw={ready.serverStats?.firestoreUserCount ?? null}
                    floor={TRADERS_FLOOR}
                  />
                </div>

                <div className="panel-card rounded-xl p-5 md:p-6">
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

              </div>

              {platformStats && (
                <div className="panel-card rounded-xl p-5 md:p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={16} className="text-accent" />
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
                          platformStats.combinedPnl >= 0 ? 'text-accent' : 'text-red-400'
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
                <div className="panel-card rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity size={16} className="text-accent" />
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
              <div className="panel-card rounded-xl p-5 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ScrollText size={16} className="text-accent" />
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
              {/*
                Last on the Overview. Every entry here was already being written and already being
                loaded — fetchRecentAuditLog runs in the panel's first wave — and nothing rendered a
                single one of them. The per-user history in the modal answers "what happened to this
                person"; nothing answered "what did I change on Tuesday".
              */}
              <div className="mb-8">
                <AdminAuditPanel entries={ready.auditLog} />
              </div>
              </>
            )}

            {tab === 'users' && (
              <div className="panel-card rounded-xl p-5 md:p-6 mb-8">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-accent" />
                    <h2 className="text-sm font-semibold text-text-primary">
                      Users ({ready.users.length})
                      {/* Shown at zero too: a count that disappears when it is 0 reads as "not
                          counted", and the question this tab is asked most is how many people
                          have a broker linked. Hidden only while the answer is not yet known. */}
                      {brokerDataLoaded && (
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
                          ? 'border-accent/50 bg-accent/15 text-accent'
                          : 'border-border/60 text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      <Link2 size={13} aria-hidden />
                      Broker connected
                    </button>
                    {/* One chip per plan, plus the two questions a plan alone cannot answer. Disabled
                        until the plans have loaded, rather than filtering against an empty map. */}
                    <div role="group" aria-label="Filter by plan" className="flex flex-wrap items-center gap-1">
                      {PLAN_FILTERS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          disabled={!ready.entitlements}
                          onClick={() => setPlanFilter(f.id)}
                          aria-pressed={planFilter === f.id}
                          className={`rounded-lg border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                            planFilter === f.id
                              ? 'border-accent/50 bg-accent/15 text-accent'
                              : 'border-border/60 text-text-secondary hover:text-text-primary hover:border-border'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
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
                        : planFilter !== 'all'
                          ? `Nobody matches “${PLAN_FILTERS.find((f) => f.id === planFilter)?.label ?? planFilter}”.`
                          : 'No users match this search.'}
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {visibleUsers.map((entry) => (
                      <li key={entry.uid}>
                        <button
                          type="button"
                          onClick={() => setSelectedUser(entry)}
                          className="w-full text-left rounded-lg border border-border/40 bg-bg-tertiary/40 px-3 py-2.5 text-xs hover:border-accent/30 transition-colors"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-text-primary">
                                {entry.username ? `@${entry.username}` : 'No username'}
                                {/*
                                  The plan, so the list answers "who is paying" without opening
                                  forty-two rows. Effective rather than stored: a cancelled
                                  subscriber still has their tier until the period they paid for
                                  ends, and a comped account has one with no subscription at all.
                                  Free is left unbadged — it is the majority and a badge on every
                                  row would carry no information.
                                */}
                                {(() => {
                                  if (!ready.entitlements) return null;
                                  const plan = effectiveTierOf(
                                    ready.entitlements.get(entry.uid) ?? null,
                                    Date.now(),
                                  );
                                  if (plan === 'free') return null;
                                  return (
                                    <span
                                      className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${PLAN_BADGE[plan]}`}
                                    >
                                      {TIER_PLANS[plan].name}
                                    </span>
                                  );
                                })()}
                                {entry.suspended && (
                                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[9px] font-medium uppercase tracking-wide">
                                    <Ban size={9} />
                                    Suspended
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
                                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[9px] font-medium uppercase tracking-wide">
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
                                    entry.totalPnl >= 0 ? 'text-accent' : 'text-red-400'
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

            {tab === 'support' && (
              <>
                <h2 className="text-base font-semibold mb-2">Support tickets</h2>
                <p className="text-xs text-text-secondary mb-4">
                  Conversations with traders. Anything marked &ldquo;waiting on you&rdquo; has a
                  message nobody has answered yet, oldest first.
                </p>
                <SupportTicketsPanel
                  tickets={ready.tickets}
                  adminUid={user?.uid ?? ''}
                  busyId={updatingKey?.startsWith('ticket:') ? updatingKey.slice('ticket:'.length) : null}
                  onStatusChange={(id, status, subject) => void handleTicketStatusChange(id, status, subject)}
                  onReplied={handleTicketReplied}
                  onOpenUser={openUserByUid}
                  canOpenUser={canOpenUserByUid}
                />
              </>
            )}

            {tab === 'costs' && (
              <div className="space-y-8">
                <CostsPanel
                  report={ready.costs}
                  error={ready.costsError}
                  loading={ready.extras === 'loading'}
                  onOpenUser={openUserByUid}
                  canOpenUser={canOpenUserByUid}
                />
                {/* Under the month table, which gives totals. This one gives the direction, which a
                    total cannot: two flat months can be stable or half of everyone leaving. */}
                <MrrMovementPanel rows={movement} />
              </div>
            )}

            {tab === 'ops' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Operations</h2>
                  <p className="text-xs text-text-secondary">
                    What the server did with nobody watching: the scheduled jobs, every sync, every billing webhook
                    and every email. Each record starts from the release that added it.
                  </p>
                </div>
                {!ready.ops && <p className="text-xs text-text-secondary">Loading the records…</p>}
                {ready.ops?.error && !ready.ops.report && (
                  <p className="text-sm text-amber-300 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
                    Could not load the Ops records: {ready.ops.error}
                  </p>
                )}
                {ready.ops?.report && (
                  <>
                    <JobRunsPanel jobs={ready.ops.report.jobs} now={now} />
                    <SyncFeedPanel
                      rows={ready.ops.report.syncFeed}
                      now={now}
                      labelFor={labelForUid}
                      onOpenUser={openUserByUid}
                      canOpenUser={canOpenUserByUid}
                    />
                    <BillingEventsPanel
                      events={ready.ops.report.billingEvents}
                      now={now}
                      labelFor={labelForUid}
                      onReplay={handleReplayBillingEvent}
                      onOpenUser={openUserByUid}
                      canOpenUser={canOpenUserByUid}
                    />
                    <EmailLogPanel
                      emails={ready.ops.report.emails}
                      now={now}
                      mailConfigured={ready.ops.report.mailConfigured}
                      uidFor={uidForEmail}
                      labelFor={labelForUid}
                      onOpenUser={openUserByUid}
                      canOpenUser={canOpenUserByUid}
                    />
                  </>
                )}
              </div>
            )}

            {tab === 'errors' && (
              <ErrorEventsPanel
                events={ready.errorEvents}
                droppedToday={ready.errorsDropped}
                busyId={updatingKey?.startsWith('error:') ? updatingKey.slice('error:'.length) : null}
                onStatusChange={(id, status) => void handleErrorStatusChange(id, status)}
                onOpenUser={openUserByUid}
                canOpenUser={canOpenUserByUid}
              />
            )}

            {tab === 'requests' && (
              <>
              {/*
                This list is signed-OUT visitors only, and said so nowhere.

                A signed-in trader who reports a bug gets a support TICKET — ReportBugContent routes
                them to SupportTicketsContent with the bug category, because a bug report is the
                start of a conversation. Only the anonymous form still writes to the bugReports
                collection this reads. So every report filed since that changed has been sitting in
                Support while this panel, the one headed "Bug reports", said there were none.
              */}
              <h2 className="text-base font-semibold mb-1">Bug reports from signed-out visitors</h2>
              <p className="text-xs text-text-secondary mb-3">
                Anyone signed in gets a support ticket instead, so their report can be replied to.{' '}
                {bugTickets > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTab('support')}
                    className="text-accent hover:text-accent transition-colors focus-ring rounded"
                  >
                    {bugTickets} open bug ticket{bugTickets === 1 ? '' : 's'} in Support &rarr;
                  </button>
                ) : (
                  'There are none open in Support right now.'
                )}
              </p>
              <StatusFilterBar value={bugFilter} onChange={setBugFilter} counts={bugFilterCounts} />

              {filteredBugs.length === 0 ? (
                <div className="panel-card rounded-xl p-8 text-center text-text-secondary text-sm">
                  {ready.reports.length === 0
                    ? 'Nothing here. Reports from signed-out visitors land in this list.'
                    : 'No reports match this filter.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBugs.map((report) => (
                    <article key={report.id} className="panel-card rounded-xl p-5 md:p-6">
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
                          <a href={report.pageUrl} className="text-accent hover:underline">
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

            {tab === 'content' && user && (
              <div className="mb-8">
                <BrokerStatusPanel adminUid={user.uid} />
              </div>
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
              <div className="panel-card rounded-xl p-5 md:p-6 mb-8">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <LifeBuoy size={16} className="text-accent" />
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
                              // 16px on a phone for the same reason as PrioritySelect: a raw select
                              // under 16px leaves iOS Safari zoomed in with no way back.
                              className="rounded border border-border/60 bg-bg-tertiary/50 px-1.5 py-1.5 md:py-0.5 text-[16px] md:text-[11px] text-text-primary focus-ring disabled:opacity-50"
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
          tickets={ready?.tickets.filter((t) => t.uid === selectedUser.uid) ?? []}
          reports={ready?.reports.filter((r) => r.uid === selectedUser.uid) ?? []}
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

      </div>
    </div>
  );
}