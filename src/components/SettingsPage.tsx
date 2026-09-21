import { useEffect, useMemo, useState, useRef } from 'react';
import { ArrowLeft, Check, CloudOff, Download, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import { useSettings } from '../context/useSettings';
import { DiamondSection } from './settings/DiamondSection';
import { useAuth } from '../context/useAuth';
import { useEntitlement } from '../context/useEntitlement';
import { journalsUnlimited, tierHas, TIER_PLANS } from '../config/tiers';
import { goToPricing } from '../utils/navigateToPath';
import type { CurrencyCode, ThemeAccent } from '../types/settings';
import type { Trade } from '../types';
import type { TradingStats } from '../utils/stats';
import { downloadBackup, parseBackup, type ParsedBackup } from '../utils/backup';
import { exportMonthReport, exportTaxYearCsv, exportTradesCsv } from '../utils/exportTrades';
import { availableTaxYears, buildTaxReport } from '../utils/taxReport';
import { formatCurrency } from '../utils/format';
import { fetchEmailPrefs, recapIsOn, setRecapOptIn } from '../services/emailPrefs';
import { ConfirmDialog } from './ConfirmDialog';

type ExportRange = 'all' | 'month' | '90' | 'ytd';

/**
 * A rule limit, or undefined when the box means "off".
 *
 * These were `Number(e.target.value) || undefined`, which quietly folded three different inputs
 * into "off": an empty box, a zero, and anything unparseable. Empty meaning off is right and is
 * now said in the copy beneath the fields. Zero and junk are not the same thing — a trade cap of
 * nought is not a rule anybody wants, and NaN reaching the settings document would come back out
 * as a limit nothing can compare against.
 *
 * So: blank, zero and unparseable all turn the limit off, deliberately and for a stated reason,
 * rather than by falling through a falsy check.
 */
function limitOrOff(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

interface SettingsPageProps {
  trades: Trade[];
  /** Every trade across all journals — used for full backups. */
  everyTrade: Trade[];
  monthStats: TradingStats;
  year: number;
  month: number;
  onBack: () => void;
  onRestoreTrades: (trades: Trade[]) => Promise<void>;
  /**
   * Wipe the journal.
   *
   * It used to be a grey line of 10px text at the bottom of the sidebar, one click away on every
   * screen in the app, directly under "+ Log Trade". Destructive things belong where the rest of
   * the destructive things are, behind a deliberate trip to Settings — and under the backup
   * button, so the offer to save a copy comes before the offer to delete everything.
   */
  onClearAll: () => void;
  /**
   * Where the plan and the cancel button actually live.
   *
   * Settings has never had either, but the terms of service and the refund policy have both told
   * people for months that cancelling happens "from Settings" — so somebody following our own
   * written promise arrived here and found nothing. This is the route that makes those two pages
   * true rather than the pages being reworded to match the gap.
   */
  onSubscription: () => void;
  onAccount: () => void;
}

export function SettingsPage({
  trades,
  everyTrade,
  monthStats,
  year,
  month,
  onBack,
  onRestoreTrades,
  onClearAll,
  onSubscription,
  onAccount,
}: SettingsPageProps) {
  const {
    settings, saveState, updateSettings, addSetupTag, renameSetupTag, removeSetupTag,
    addStrategy, removeStrategy,
    addAccount, removeAccount, setActiveAccount, journalLimit, canAddJournal,
  } = useSettings();
  const { username, user, firebaseEnabled } = useAuth();
  const { tier, limits } = useEntitlement();
  const [newTag, setNewTag] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newStrategy, setNewStrategy] = useState('');
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupMessageIsError, setBackupMessageIsError] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  /* The tax export is per YEAR, so everything about it derives from the selected one — including
     the wash-sale count, which used to be taken over the whole journal and shown beside a button
     that claimed to export a single year. */
  /* The recap opt-in lives in its own collection rather than in settings — see
     services/emailPrefs.ts for why the scheduled job needs it there. Loaded once, and stored with
     the uid it belongs to so a signed-out render can never show somebody else's choice. */
  // recap is tri-state: true, false, or null for "never said" — see services/emailPrefs.
  const [recapPref, setRecapPref] = useState<{ uid: string; recap: boolean | null } | null>(null);
  const [recapSaving, setRecapSaving] = useState(false);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    let cancelled = false;
    void fetchEmailPrefs(uid).then((prefs) => {
      if (!cancelled) setRecapPref({ uid, recap: prefs.recap });
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  /* Matches what the scheduled job will actually do — see recapIsOn. A plan that includes
     the written review is opted in unless the person has said no. */
  const recapIncludedByPlan = tierHas(tier, 'aiReview');
  const recapOn =
    recapPref?.uid === user?.uid && recapIsOn(recapPref, recapIncludedByPlan);

  const toggleRecap = async (next: boolean) => {
    const uid = user?.uid;
    if (!uid) return;
    setRecapSaving(true);
    setRecapPref({ uid, recap: next });
    try {
      await setRecapOptIn(uid, next);
    } catch {
      setRecapPref({ uid, recap: !next });
    } finally {
      setRecapSaving(false);
    }
  };

  /*
   * Export range.
   *
   * Filtered on the trade's own date key rather than through Date(), which reads a bare YYYY-MM-DD
   * as UTC midnight and then compares it in local time — so a boundary trade lands in the wrong
   * side of the range one timezone west of Greenwich.
   */
  const [exportRange, setExportRange] = useState<ExportRange>('all');
  const exportTrades = useMemo(() => {
    if (exportRange === 'all') return trades;

    if (exportRange === 'month') {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      return trades.filter((t) => t.date?.startsWith(prefix));
    }

    const now = new Date();
    if (exportRange === 'ytd') {
      return trades.filter((t) => t.date >= `${now.getFullYear()}-01-01`);
    }

    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    const key = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    return trades.filter((t) => t.date >= key);
  }, [trades, exportRange, year, month]);

  const exportFilename = useMemo(() => {
    if (exportRange === 'month') return `trades-${year}-${String(month + 1).padStart(2, '0')}.csv`;
    if (exportRange === 'ytd') return `trades-${new Date().getFullYear()}.csv`;
    if (exportRange === '90') return 'trades-last-90-days.csv';
    return 'trades-all.csv';
  }, [exportRange, year, month]);

  /** "2026-06-03 → 2026-09-19", from the dates in the file — enough to recognise a backup by. */
  const backupRange = useMemo(() => {
    const dates = (pendingBackup?.trades ?? []).map((t) => t.date).filter(Boolean).sort();
    if (dates.length === 0) return null;
    const first = dates[0]!;
    const last = dates[dates.length - 1]!;
    return first === last ? first : `${first} → ${last}`;
  }, [pendingBackup]);

  const taxYears = useMemo(() => availableTaxYears(trades), [trades]);
  const [taxYear, setTaxYear] = useState(() => availableTaxYears(trades)[0] ?? new Date().getFullYear());
  const taxReport = useMemo(() => buildTaxReport(trades, taxYear), [trades, taxYear]);

  const handleBackupFile = async (file: File | null) => {
    if (!file) return;
    setBackupMessage(null);
    try {
      const parsed = parseBackup(await file.text());
      if (parsed.trades.length === 0 && Object.keys(parsed.settings).length === 0) {
        throw new Error('This backup is empty.');
      }
      setPendingBackup(parsed);
    } catch (err) {
      setBackupMessageIsError(true);
      setBackupMessage(err instanceof Error ? err.message : 'Could not read backup file.');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    setBackupMessage(null);
    try {
      await onRestoreTrades(pendingBackup.trades);
      if (Object.keys(pendingBackup.settings).length > 0) {
        updateSettings(pendingBackup.settings);
      }
      setBackupMessageIsError(false);
      setBackupMessage(
        `Restored ${pendingBackup.trades.length} trade${pendingBackup.trades.length === 1 ? '' : 's'} and settings.`,
      );
      setPendingBackup(null);
    } catch (err) {
      setBackupMessageIsError(true);
      setBackupMessage(err instanceof Error ? err.message : 'Restore failed. Try again.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="pb-6">
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">Settings</h1>
            {/*
              Every field here writes as you type and said nothing either way. Silence is fine
              while it works and invisible when it does not — and settings-save is already a real
              scope in the error feed, so failures were happening and only we could see them.
            */}
            {firebaseEnabled && user && saveState.status !== 'idle' && (
              <span
                key={saveState.at}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  saveState.status === 'saved'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                {saveState.status === 'saved' ? <Check size={12} /> : <CloudOff size={12} />}
                {saveState.status === 'saved' ? 'Saved' : 'Saved on this device only'}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">Preferences, accounts, and data export</p>
          {firebaseEnabled && user && username && (
            <p className="text-sm text-accent mt-2 font-medium">@{username}</p>
          )}
          {saveState.status === 'failed' && (
            /* Said once, plainly. The setting IS applied locally — losing it only happens when they
               open the app somewhere else — so this is a warning, not an error to panic about. */
            <p className="text-xs text-red-400 mt-2">
              Your last change could not reach the cloud. It is applied on this device and will sync
              when the connection recovers.
            </p>
          )}
        </div>


        {/*
          * Cards flow into columns instead of one long stack.
          *
          * These are ten independent panels of very different heights, so column flow packs
          * them tightly where a 2-up grid would leave a ragged gap beside every short one.
          * gap-6 matches the vertical rhythm the stack had, and break-inside-avoid stops a
          * card being split down the middle across a column boundary.
          */}
        <div className="columns-1 lg:columns-2 2xl:columns-3 gap-6 [&>section]:mb-6 [&>section]:break-inside-avoid">
        {firebaseEnabled && user && (
          <section className="panel-card p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Account &amp; billing
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              You are on {TIER_PLANS[tier].name}. Your plan, your payment history and the cancel
              button live on their own screens.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSubscription}
                className="btn-primary px-3.5 py-2 text-sm font-semibold"
              >
                Subscription &amp; billing
              </button>
              <button
                type="button"
                onClick={onAccount}
                className="px-3.5 py-2 text-sm font-medium rounded-lg border border-border text-text-secondary hover:text-text-primary transition-colors focus-ring"
              >
                Account settings
              </button>
            </div>
          </section>
        )}

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Display</h2>

          <label className="block">
            <span className="text-xs text-text-secondary mb-1.5 block">Currency</span>
            <select
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value as CurrencyCode })}
              className="input-field"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (C$)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-text-secondary mb-1.5 block">Default symbol</span>
            <input
              type="text"
              value={settings.defaultSymbol}
              onChange={(e) => updateSettings({ defaultSymbol: e.target.value.toUpperCase() })}
              className="input-field"
              maxLength={12}
            />
          </label>

          <div>
            <span className="text-xs text-text-secondary mb-2 block">Theme accent</span>
            <div className="flex gap-2">
              {(['emerald', 'cyan', 'violet'] as ThemeAccent[]).map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => updateSettings({ themeAccent: accent })}
                  className={`px-4 py-2 rounded-lg text-sm capitalize border transition-colors focus-ring ${
                    settings.themeAccent === accent
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-border text-text-secondary hover:border-border/80'
                  }`}
                >
                  {accent}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Setup tags</h2>
          {/*
            Editable, finally. A tag could be added and never corrected, so a typo was permanent —
            and it does not sit quietly in a list: every trade carries its setup as a string, so
            BREAKOUT and BREKOUT become two separate rows on the Performance breakdown forever.
          */}
          <div className="flex flex-wrap gap-2">
            {settings.setupTags.map((tag) => (
              <span
                key={tag}
                className="group inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs bg-bg-tertiary border border-border/60"
              >
                {editingTag === tag ? (
                  <input
                    autoFocus
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onBlur={() => {
                      renameSetupTag(tag, tagDraft);
                      setEditingTag(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setEditingTag(null);
                    }}
                    aria-label={`Rename ${tag}`}
                    className="w-24 bg-transparent outline-none uppercase"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTag(tag);
                      setTagDraft(tag);
                    }}
                    title="Rename"
                    className="focus-ring rounded"
                  >
                    {tag}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeSetupTag(tag)}
                  aria-label={`Remove ${tag}`}
                  title="Remove from the list — trades keep the tag"
                  className="p-0.5 rounded-full text-text-secondary hover:text-red-400 focus-ring"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {settings.setupTags.length === 0 && (
              <p className="text-xs text-text-secondary">No tags yet.</p>
            )}
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Tap a tag to rename it — the change follows through to every trade using it. Removing
            one takes it off this list; trades keep the tag they were saved with.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="New tag name"
              className="input-field flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addSetupTag(newTag);
                  setNewTag('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                addSetupTag(newTag);
                setNewTag('');
              }}
              className="btn-primary px-4 py-2 text-sm"
            >
              <Plus size={16} />
            </button>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Journals</h2>
          <p className="text-xs text-text-secondary">Each journal keeps its own trades — switch from the dashboard anytime.</p>
          <div className="space-y-2">
            {settings.accounts.map((account) => (
              <div
                key={account.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  settings.activeAccountId === account.id
                    ? 'border-profit-bright/40 bg-profit-bright/5'
                    : 'border-border/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveAccount(account.id)}
                  className="flex-1 text-left text-sm font-medium focus-ring rounded"
                >
                  {account.name}
                  {settings.activeAccountId === account.id && (
                    <span className="ml-2 text-[10px] text-profit-bright uppercase">Active</span>
                  )}
                </button>
                {settings.accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAccount(account.id)}
                    className="text-text-secondary hover:text-loss-bright p-1 focus-ring rounded"
                    aria-label={`Remove ${account.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newAccount}
              onChange={(e) => setNewAccount(e.target.value)}
              placeholder="New journal name"
              disabled={!canAddJournal}
              className="input-field flex-1 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!canAddJournal}
              onClick={() => {
                addAccount(newAccount);
                setNewAccount('');
              }}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-text-secondary">
            {canAddJournal ? (
              <>
                {settings.accounts.length} of{' '}
                {journalsUnlimited(limits) ? 'unlimited' : journalLimit} journals used on{' '}
                {TIER_PLANS[tier].name}.
              </>
            ) : (
              <>
                You are using all {journalLimit} journals on {TIER_PLANS[tier].name}.{' '}
                <button
                  type="button"
                  onClick={goToPricing}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors focus-ring rounded"
                >
                  See plans
                </button>{' '}
                for more, or remove one above.
              </>
            )}
          </p>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Trading rules</h2>
          {/* "violations show on the analytics panel" undersold it by a release — these also drive
              the banner at the top of the dashboard, which warns BEFORE a limit goes rather than
              listing it afterwards, and the rule simulator tests them against your own history. */}
          <p className="text-xs text-text-secondary">
            Your daily limits. The journal warns you as you approach one, and the rule simulator can
            test them against your own history before you commit to them.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.tradingRules.enabled}
              onChange={(e) => updateSettings({ tradingRules: { ...settings.tradingRules, enabled: e.target.checked } })}
              className="rounded border-border"
            />
            Enable rule tracking
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Max daily loss ($)</span>
              <input
                type="number"
                value={settings.tradingRules.maxDailyLoss ?? ''}
                onChange={(e) =>
                  updateSettings({
                    tradingRules: { ...settings.tradingRules, maxDailyLoss: limitOrOff(e.target.value) },
                  })
                }
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Max trades / day</span>
              <input
                type="number"
                value={settings.tradingRules.maxTradesPerDay ?? ''}
                onChange={(e) =>
                  updateSettings({
                    tradingRules: { ...settings.tradingRules, maxTradesPerDay: limitOrOff(e.target.value) },
                  })
                }
                className="input-field"
              />
            </label>
            {/* Daily target has been in TradingRules, checkRuleViolations and the dashboard banner
                since rules shipped, with no field here to set it — enforced, and unreachable. */}
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Daily target ($)</span>
              <input
                type="number"
                value={settings.tradingRules.maxDailyGain ?? ''}
                onChange={(e) =>
                  updateSettings({
                    tradingRules: { ...settings.tradingRules, maxDailyGain: limitOrOff(e.target.value) },
                  })
                }
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Losses in a row</span>
              <input
                type="number"
                value={settings.tradingRules.maxConsecutiveLosses ?? ''}
                onChange={(e) =>
                  updateSettings({
                    tradingRules: {
                      ...settings.tradingRules,
                      maxConsecutiveLosses: limitOrOff(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </label>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Leave a box empty to turn that limit off. Daily target and losses in a row stop the day
            the same way the loss limit does.
          </p>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Strategy playbook</h2>
          <p className="text-xs text-text-secondary">Define setups and link them to trades in the advanced trade form.</p>
          <div className="space-y-2">
            {settings.strategies.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/60">
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                <button type="button" onClick={() => removeStrategy(s.id)} className="text-text-secondary hover:text-loss-bright p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newStrategy}
              onChange={(e) => setNewStrategy(e.target.value)}
              placeholder="Strategy name"
              className="input-field flex-1"
            />
            <button
              type="button"
              onClick={() => {
                addStrategy(newStrategy);
                setNewStrategy('');
              }}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Add
            </button>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Goals & reminders</h2>
          <label className="block">
            <span className="text-xs text-text-secondary mb-1 block">
              Monthly P&L goal (0 to disable)
            </span>
            <input
              type="number"
              step="50"
              min="0"
              value={settings.monthlyGoalPnl || ''}
              onChange={(e) =>
                updateSettings({ monthlyGoalPnl: Math.max(0, Number(e.target.value) || 0) })
              }
              className="input-field"
              placeholder="2000"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary mb-1 block">
              Trading capital (unlocks % return vs SPY)
            </span>
            <input
              type="number"
              step="500"
              min="0"
              value={settings.accountSize || ''}
              onChange={(e) =>
                updateSettings({ accountSize: Math.max(0, Number(e.target.value) || 0) })
              }
              className="input-field"
              placeholder="25000"
            />
            <span className="text-[11px] text-text-secondary mt-1 block">
              Only used to turn your P&amp;L into a percentage so it can be compared to the market.
              Leave blank to keep the dashboard in dollars.
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.remindersEnabled}
              onChange={(e) => updateSettings({ remindersEnabled: e.target.checked })}
              className="rounded border-border"
            />
            End-of-day journal reminder
          </label>
          {settings.remindersEnabled && (
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Reminder time (local)</span>
              <input
                type="time"
                value={settings.reminderTime}
                onChange={(e) => updateSettings({ reminderTime: e.target.value })}
                className="input-field"
              />
            </label>
          )}

          {user && firebaseEnabled && (
            <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recapOn}
                  disabled={recapSaving || recapPref === null}
                  onChange={(e) => void toggleRecap(e.target.checked)}
                  className="rounded border-border mt-0.5"
                />
                <span>
                  Email me a weekly recap
                  <span className="block text-[11px] text-text-secondary mt-0.5">
                    Sunday morning: net P&amp;L, best and worst day, your top setup, and how the week
                    compared to the one before. Only sent in weeks you actually traded.
                  </span>
                </span>
              </label>
              <p className="text-[11px] text-text-secondary">
                Replies to your own support tickets are separate and always sent.
              </p>
            </div>
          )}
        </section>

        <section className="panel-card p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Export data</h2>

          {/*
            The button said "all trades" and exported the whole journal, with the selected month
            only ever reaching the filename — so a file called trades-2026-9.csv held every trade
            since the account opened. Two ways that misleads: somebody looking for one month gets
            everything, and somebody archiving a year gets a file named after a month.
          */}
          <label className="block">
            <span className="text-xs text-text-secondary mb-1 block">Range</span>
            <select
              value={exportRange}
              onChange={(e) => setExportRange(e.target.value as ExportRange)}
              className="input-field"
            >
              <option value="all">Everything</option>
              <option value="month">This month</option>
              <option value="90">Last 90 days</option>
              <option value="ytd">This year so far</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => exportTradesCsv(exportTrades, exportFilename)}
            disabled={exportTrades.length === 0}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm disabled:opacity-50"
          >
            <Download size={16} />
            {exportTrades.length === 0
              ? 'No trades in that range'
              : `Export ${exportTrades.length} trade${exportTrades.length === 1 ? '' : 's'} (CSV)`}
          </button>
          <button
            type="button"
            onClick={() => exportMonthReport(trades, monthStats, year, month, settings.currency)}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm"
          >
            <FileText size={16} />
            Print monthly report (PDF)
          </button>
          <div className="rounded-lg border border-border/50 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <label htmlFor="tax-year" className="text-xs text-text-secondary shrink-0">
                Tax year
              </label>
              <select
                id="tax-year"
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                className="input-field text-sm py-1.5 px-2 flex-1"
              >
                {(taxYears.length > 0 ? taxYears : [taxYear]).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={taxReport.tradeCount === 0}
              onClick={() => exportTaxYearCsv(trades, taxYear)}
              className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm disabled:opacity-50"
            >
              <Download size={16} />
              Export realized P&amp;L for {taxYear}
            </button>

            <p className="text-xs text-text-secondary">
              {taxReport.tradeCount === 0
                ? `No closed trades in ${taxYear} in this journal.`
                : `${taxReport.tradeCount} closed trade${taxReport.tradeCount === 1 ? '' : 's'} · net ${formatCurrency(taxReport.netPnl, settings.currency)} · totals and a per-symbol breakdown included.`}
            </p>

            {taxReport.potentialWashSaleCount > 0 && (
              <p className="text-xs text-amber-300">
                {taxReport.potentialWashSaleCount} potential wash sale
                {taxReport.potentialWashSaleCount === 1 ? '' : 's'} flagged for review. These are
                matched from round-trip results, not a disallowed-loss calculation — check them
                against your broker statements.
              </p>
            )}

            <p className="text-xs text-text-secondary">
              A working file for your accountant, not a tax document. Trend Chasers does not give
              tax advice.
            </p>
          </div>
        </section>

        <section className="panel-card p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Backup & restore</h2>
          <p className="text-xs text-text-secondary">
            Download a full backup of every journal — all trades, tags, accounts, and preferences —
            as one file. Restore it here on any device.
          </p>
          <button
            type="button"
            onClick={() => downloadBackup(everyTrade, settings)}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm"
          >
            <Download size={16} />
            Download full backup ({everyTrade.length} trade{everyTrade.length === 1 ? '' : 's'})
          </button>
          <button
            type="button"
            disabled={restoring}
            onClick={() => backupInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm disabled:opacity-50"
          >
            <Upload size={16} />
            {restoring ? 'Restoring…' : 'Restore from backup'}
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleBackupFile(e.target.files?.[0] ?? null)}
            aria-label="Choose backup file"
          />
          {backupMessage && (
            <p className={`text-xs ${backupMessageIsError ? 'text-red-400' : 'text-profit-bright'}`}>
              {backupMessage}
            </p>
          )}
        </section>

        <DiamondSection />

        <section className="panel-card p-5 space-y-3 border-red-500/25">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400/90">Danger zone</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Deletes every trade in this journal on every device signed into this account. Download a
            backup first — this is not undoable, and a re-sync only brings back what your broker
            still has.
          </p>
          <button
            type="button"
            onClick={onClearAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors focus-ring"
          >
            <Trash2 size={16} />
            Clear this journal
          </button>
          {/* Clearing the journal and deleting the account are the two irreversible things this
              product does, and they sat on different screens with nothing linking them — so
              somebody who came here to leave found only the half that empties the journal and
              keeps charging them. */}
          {firebaseEnabled && user && (
            <button
              type="button"
              onClick={onAccount}
              className="w-full text-center text-xs text-text-secondary hover:text-red-400 transition-colors focus-ring rounded py-1"
            >
              Looking to delete your whole account? That is on Account settings &rarr;
            </button>
          )}
        </section>
        </div>
      </div>

      {pendingBackup && (
        <ConfirmDialog
          title="Restore this backup?"
          /*
           * Says which backup, not just how many trades.
           *
           * It named a count and the day the file was made, which does not distinguish last
           * night's from one taken in June if both hold a few hundred trades — and the file picker
           * before it shows only a filename. The span of dates inside is the thing somebody
           * actually recognises a backup by, and whether it carries settings decides whether
           * confirming also rewrites their tags and journals.
           */
          message={`This will restore ${pendingBackup.trades.length} trade(s)${
            backupRange ? ` covering ${backupRange}` : ''
          }${
            pendingBackup.exportedAt
              ? `, from a backup made ${new Date(pendingBackup.exportedAt).toLocaleDateString()}`
              : ''
          }. ${
            Object.keys(pendingBackup.settings).length > 0
              ? 'Your tags, journals and preferences come with it. '
              : 'It carries no settings, so yours are left alone. '
          }Existing trades with the same IDs are updated; nothing is deleted.`}
          confirmLabel="Restore backup"
          onCancel={() => setPendingBackup(null)}
          onConfirm={() => {
            void handleRestore();
          }}
        />
      )}
    </div>
  );
}
